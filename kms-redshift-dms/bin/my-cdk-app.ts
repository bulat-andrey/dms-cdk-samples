import { App } from 'aws-cdk-lib';
import { Producer } from '../lib/producer';
import { Consumer } from '../lib/consumer';
import { KmsSecretsmanagerRedshiftDMStack} from "../lib/Kms_SecretsManag_Redshift_DMS";
import * as cdk from "aws-cdk-lib";

const app = new App();
const producer = new Producer(app, 'Producer');
new Consumer(app, 'Consumer', { userBucket: producer.myBucket });
new KmsSecretsmanagerRedshiftDMStack(app, 'KmsSecretsmanagerRedshiftDMStack');
