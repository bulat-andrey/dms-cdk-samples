import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as redshift from 'aws-cdk-lib/aws-redshift';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {SecretValue} from "aws-cdk-lib";

export class RedshiftSecretsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const RedshiftSecret = new secretsmanager.Secret(this, 'RedshiftSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'rsadmin' }),
        generateStringKey: 'password',
        excludeCharacters: ';.:+{}/@"\\\'', // for DMS endpoint limitations
        excludePunctuation: true,
        passwordLength: 14
      }
    });

    // Create a Redshift cluster with managed master password
    const cluster = new redshift.CfnCluster(this, 'RedshiftCluster', {
      clusterType: 'multi-node',
      dbName: 'dev',
      masterUsername: 'rsadmin',
      nodeType: 'dc2.large',
      numberOfNodes: 2,
      masterUserPassword: RedshiftSecret.secretValueFromJson('password').unsafeUnwrap(),
    });

    const RedshiftDmsEndpointSecret = new secretsmanager.Secret(this, 'RedshiftDmsEndpointSecret', {
    secretObjectValue: {
      username: SecretValue.unsafePlainText(cluster.masterUsername),
      host: SecretValue.unsafePlainText(cluster.attrEndpointAddress),
      port: SecretValue.unsafePlainText(cluster.attrEndpointPort.toString()),
      password: RedshiftSecret.secretValueFromJson('password'),
    },
  });

    // // Output the secret ARN
    // new cdk.CfnOutput(this, 'SecretARN', {
    //   value: RedshiftDmsEndpointSecret.secretArn,
    //   description: 'The ARN of the Secrets Manager secret for the Redshift connection details'
    // });
  }
}