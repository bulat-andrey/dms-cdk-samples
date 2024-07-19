import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as redshift from "aws-cdk-lib/aws-redshift";
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dms from 'aws-cdk-lib/aws-dms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {CfnOutput, SecretValue} from "aws-cdk-lib";
import { Names } from 'aws-cdk-lib';

export class RedshiftStack extends cdk.Stack {
  public readonly cluster: redshift.CfnCluster;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const redshiftMasterUsername = 'admin';
    const redshiftMasterUsernameSecret = new secretsmanager.Secret(this, 'Secret', {
      secretObjectValue: {
        username: SecretValue.unsafePlainText(redshiftMasterUsername),
        database: SecretValue.unsafePlainText('dev'),
        password: SecretValue.unsafePlainText('Password123'),
        // accessKey.secretAccessKey,
      },
});
    const vpc = new ec2.Vpc(this, 'RedshiftVPC', {
      natGateways: 0,
    });

    const dmsSecurityGroup = new ec2.SecurityGroup(this, 'DMSVpcSecurityGroup', {
      vpc,
      description: 'Security group for DMS',
      allowAllOutbound: true,
      securityGroupName: 'DMS sg',
    });

    const clusterSubnetGroup = new redshift.CfnClusterSubnetGroup(this, 'RedshiftClusterSubnetGroup', {
      description: 'Subnet group for Redshift cluster',
      subnetIds: vpc.publicSubnets.map(subnet => subnet.subnetId),
    });

    const kmsKey = new kms.Key(this, 'RedshiftKey', {
      enableKeyRotation: true, // Automatically rotate the key every year
      description: 'KMS key for Redshift cluster encryption',
    });

    const dmsEndpointRole = new iam.Role(this, 'DMSEndpointRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('dms.amazonaws.com'),
        new iam.ServicePrincipal(`dms.${this.region}.amazonaws.com`)
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonDMSRedshiftS3Role'),
      ],
    });

    const Suffix = Names.uniqueId(this).toLowerCase();
    const bucketName = `${Suffix}-dms-kms-test`;

    const dmsBucket = new s3.Bucket(this, 'dms_bucket', {
      bucketName: bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    dmsBucket.grantReadWrite(dmsEndpointRole);

    const dmsReplicationSubnetGroup = new dms.CfnReplicationSubnetGroup(this, 'DMSReplicationSubnetGroup', {
      replicationSubnetGroupDescription: 'Subnet group for DMS replication instance',
      subnetIds: vpc.publicSubnets.map(subnet => subnet.subnetId),
          // vpc.privateSubnets.map(subnet => subnet.subnetId),
    });

    const dmsReplicationInstance = new dms.CfnReplicationInstance(this, 'DMSReplicationInstance', {
      replicationInstanceClass: 'dms.t3.large',
      allocatedStorage: 50,
      engineVersion: '3.5.3',
      kmsKeyId: kmsKey.keyArn,
      replicationSubnetGroupIdentifier: dmsReplicationSubnetGroup.ref,
      vpcSecurityGroupIds: [dmsSecurityGroup.securityGroupId],
      publiclyAccessible: false,
    });

    dmsReplicationInstance.node.addDependency(dmsSecurityGroup);
    dmsReplicationInstance.node.addDependency(dmsReplicationSubnetGroup);

    const firstPrivateIP = cdk.Fn.select(0, [dmsReplicationInstance.attrReplicationInstancePrivateIpAddresses])
    const prefixListId = 'pl-4e2ece27';
    const prefixListPeer = ec2.Peer.prefixList(prefixListId);

    const vpcSecurityGroup = new ec2.SecurityGroup(this, 'RedshiftVpcSecurityGroup', {
      vpc,
      description: 'Security group for Redshift cluster',
      allowAllOutbound: true,
      securityGroupName: 'Redshift-sg',
    });

    vpcSecurityGroup.node.addDependency(dmsReplicationInstance)


    vpcSecurityGroup.addIngressRule(
        prefixListPeer,
        ec2.Port.tcp(5439)
    );
    vpcSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(`${firstPrivateIP}/32`),
      // ec2.Peer.ipv4('10.0.0.0/16'),
      ec2.Port.tcp(5439)
    );

    const cluster = new redshift.CfnCluster(this, 'RedshiftCluster', {
      clusterType: 'multi-node',
      dbName: 'dev',
      masterUsername: redshiftMasterUsername,
      masterUserPassword: redshiftMasterUsernameSecret.secretValueFromJson('password').unsafeUnwrap(),
      // manageMasterPassword: true,
      nodeType: 'dc2.large',
      numberOfNodes: 2,
      clusterSubnetGroupName: clusterSubnetGroup.ref,
      publiclyAccessible: true, // Make the cluster publicly accessible
      vpcSecurityGroupIds: [vpcSecurityGroup.securityGroupId],
      encrypted: true,
      kmsKeyId: kmsKey.keyArn,
    });

    const clusterEndpoint = cluster.attrEndpointAddress.toString();
    // const clusterPort = cluster.attrEndpointPort;
    // const clusterEndpoint = 'cluster.attrEndpointAddress.toString()';
    const clusterPort = 5439;

    const dmsEndpoint = new dms.CfnEndpoint(this, 'DMSEndpoint', {
      endpointType: 'target',
      engineName: 'redshift',
      port:  5439,
      databaseName: 'dev',
      serverName: clusterEndpoint,
      username: 'admin',
      password: 'Password123',
      kmsKeyId: kmsKey.keyArn,
      sslMode: 'none',
      redshiftSettings: {
        serverSideEncryptionKmsKeyId: kmsKey.keyArn,
        bucketFolder: 'dms-redshift-target',
        bucketName: dmsBucket.bucketName,
        // secretsManagerSecretId: redshiftMasterPasswordSecret.secretArn,
        // secretsManagerAccessRoleArn:  dmsEndpointRole.roleArn,
        serviceAccessRoleArn: dmsEndpointRole.roleArn
      },
    });

    dmsEndpoint.node.addDependency(dmsBucket);
    dmsEndpoint.node.addDependency(cluster);

    new CfnOutput(dmsBucket, 'dmsBucketURL', { value: dmsBucket.bucketWebsiteUrl });
    new CfnOutput(cluster, 'cluster', { value: cluster.ref })
  }
}