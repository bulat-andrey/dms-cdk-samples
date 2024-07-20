import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as redshift from "aws-cdk-lib/aws-redshift";
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dms from 'aws-cdk-lib/aws-dms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {CfnOutput, SecretValue} from "aws-cdk-lib";
import { hashValue } from './utils';

export class KmsSecretsmanagerRedshiftDMStack extends cdk.Stack {
  public readonly cluster: redshift.CfnCluster;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'RedshiftVPC', {
        ipAddresses: ec2.IpAddresses.cidr('11.0.0.0/16'),
        natGateways: 0,
        maxAzs: 2,
        // availabilityZones: ['us-east-1a', 'us-east-1b'],
        enableDnsHostnames: true,
        enableDnsSupport: true,
        subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    const EndpointSecurityGroup = new ec2.SecurityGroup(this, 'SecretsEndpointSecurityGroup', {
      vpc,
      description: 'Security group for Endpoint',
      allowAllOutbound: true,
      securityGroupName: 'VCPEndpointSecrets-sg',
    });

    const secretsManagerEndpoint = new ec2.InterfaceVpcEndpoint(this, 'SecretsManagerEndpoint', {
      vpc: vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [EndpointSecurityGroup],
    });
    secretsManagerEndpoint.node.addDependency(EndpointSecurityGroup);

    const dmsSecurityGroup = new ec2.SecurityGroup(this, 'DMSVpcSecurityGroup', {
      vpc,
      description: 'Security group for DMS',
      allowAllOutbound: true,
      securityGroupName: 'DMS sg',
    });

     // private subnets from the VPC
    const privateSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    });

    // Create arrays of CIDR blocks and Ids from the private subnets
    const privateSubnetCidrs = Array.from(privateSubnets.subnets).map(subnet => subnet.ipv4CidrBlock);
    const privateSubnetsIds = Array.from(privateSubnets.subnets).map(subnet => subnet.subnetId);

    // Add an ingress rule to the dmsSecurityGroup for each private subnet CIDR to read from VPC endpoint Secretsmanager
    privateSubnetCidrs.forEach(cidr => {
      dmsSecurityGroup.addIngressRule(ec2.Peer.ipv4(cidr), ec2.Port.tcp(443));
    });

    const clusterSubnetGroup = new redshift.CfnClusterSubnetGroup(this, 'RedshiftClusterSubnetGroup', {
      description: 'Subnet group for Redshift cluster',
      subnetIds: vpc.publicSubnets.map(subnet => subnet.subnetId),
    });

    const kmsKey = new kms.Key(this, 'RedshiftKey', {
      enableKeyRotation: true, // Automatically rotate the key every year
      description: 'KMS key for Redshift cluster encryption',
    });

    const kmsDecryptPolicy = new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['kms:Decrypt'],
    resources: [kmsKey.keyArn],
    });

    const dmsEndpointRole = new iam.Role(this, 'DMSEndpointRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('dms.amazonaws.com'),
        new iam.ServicePrincipal(`dms.${this.region}.amazonaws.com`)
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonDMSRedshiftS3Role'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess')
      ],
    });
    dmsEndpointRole.node.addDependency(kmsKey);
    dmsEndpointRole.addToPolicy(kmsDecryptPolicy);

    dmsEndpointRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [kmsKey.keyArn],
      })
    );

    // bucket name + hash from utils.tst
    let s3BucketPrefix = 'dms-kms-test'
    let maxS3BucketNameLength = 60
    let shortHash = hashValue(s3BucketPrefix).slice(0, maxS3BucketNameLength-s3BucketPrefix.length-10);
    let randomSuffix = Math.floor(Math.random() * 1000000).toString().padStart(10, '0');
    let s3BucketName = `${s3BucketPrefix}-${shortHash}-${randomSuffix}`

    const dmsBucket = new s3.Bucket(this, 'dms_bucket', {
      bucketName: s3BucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    dmsBucket.grantReadWrite(dmsEndpointRole);

    // console.log('Private Subnets check 2 :', privateSubnets); // for debugging

    const dmsReplicationSubnetGroup = new dms.CfnReplicationSubnetGroup(this, 'DMSReplicationSubnetGroup', {
      replicationSubnetGroupDescription: 'Subnet group for DMS replication instance',
      subnetIds: privateSubnetsIds
    });
    dmsReplicationSubnetGroup.node.addDependency(vpc);

    const dmsReplicationInstance = new dms.CfnReplicationInstance(this, 'DMSReplicationInstance', {
      replicationInstanceClass: 'dms.c5.4xlarge',
      allocatedStorage: 50,
      engineVersion: '3.5.3',
      kmsKeyId: kmsKey.keyArn,
      replicationSubnetGroupIdentifier: dmsReplicationSubnetGroup.ref,
      vpcSecurityGroupIds: [dmsSecurityGroup.securityGroupId],
      publiclyAccessible: false,
    });

    dmsReplicationInstance.node.addDependency(dmsSecurityGroup);
    dmsReplicationInstance.node.addDependency(dmsReplicationSubnetGroup);

    const dmsRIfirstPrivateIP = cdk.Fn.select(0, [dmsReplicationInstance.attrReplicationInstancePrivateIpAddresses])

    const RedshiftSecurityGroup = new ec2.SecurityGroup(this, 'RedshiftVpcSecurityGroup', {
      vpc,
      description: 'Security group for Redshift cluster',
      allowAllOutbound: true,
      securityGroupName: 'Redshift-sg',
    });
    RedshiftSecurityGroup.node.addDependency(dmsReplicationInstance)

    RedshiftSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(`${dmsRIfirstPrivateIP}/32`),
      ec2.Port.tcp(5439)
    );

    const RedshiftSecret = new secretsmanager.Secret(this, 'RedshiftSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'rsadmin' }),
        generateStringKey: 'password',
        excludeCharacters: ';.:+{}/@"\\\'', // for DMS endpoint limitations
        excludePunctuation: true,
        passwordLength: 14
      }
    });

    const cluster = new redshift.CfnCluster(this, 'RedshiftCluster', {
      clusterType: 'multi-node',
      dbName: 'dev',
      masterUsername: RedshiftSecret.secretValueFromJson('username').unsafeUnwrap(),
      masterUserPassword: RedshiftSecret.secretValueFromJson('password').unsafeUnwrap(),
      nodeType: 'dc2.large',
      numberOfNodes: 2,
      clusterSubnetGroupName: clusterSubnetGroup.ref,
      publiclyAccessible: true, // Make the cluster publicly accessible
      vpcSecurityGroupIds: [RedshiftSecurityGroup.securityGroupId],
      encrypted: true,
      kmsKeyId: kmsKey.keyArn,
    });
    cluster.node.addDependency(RedshiftSecret);
    cluster.node.addDependency(RedshiftSecurityGroup);

    const clusterEndpoint = cluster.attrEndpointAddress.toString();
    const clusterPort = cluster.attrEndpointPort;

    const RedshiftDmsEndpointSecret = new secretsmanager.Secret(this, 'RedshiftDmsEndpointSecret', {
    secretObjectValue: {
      username: SecretValue.unsafePlainText(cluster.masterUsername),
      host: SecretValue.unsafePlainText(cluster.attrEndpointAddress),
      port: SecretValue.unsafePlainText(cluster.attrEndpointPort.toString()),
      password: RedshiftSecret.secretValueFromJson('password'),
    },
  });

    const dmsEndpoint = new dms.CfnEndpoint(this, 'DMSEndpoint', {
      endpointType: 'target',
      engineName: 'redshift',
      databaseName: 'dev',
      kmsKeyId: kmsKey.keyArn,
      sslMode: 'none',
      redshiftSettings: {
        serverSideEncryptionKmsKeyId: kmsKey.keyArn,
        bucketFolder: 'dms-redshift-target',
        bucketName: dmsBucket.bucketName,
        secretsManagerSecretId: RedshiftDmsEndpointSecret.secretName,
        secretsManagerAccessRoleArn:  dmsEndpointRole.roleArn,
        serviceAccessRoleArn: dmsEndpointRole.roleArn
      },
    });
    dmsEndpoint.node.addDependency(dmsBucket);
    dmsEndpoint.node.addDependency(cluster);
    dmsEndpoint.node.addDependency(dmsEndpointRole);
    dmsEndpoint.node.addDependency(RedshiftDmsEndpointSecret);

  }
}