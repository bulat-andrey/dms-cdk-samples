import { App } from 'aws-cdk-lib';
import { Producer } from '../lib/producer';
import { Consumer } from '../lib/consumer';
import { RedshiftStack} from "../lib/redshift";

const app = new App();
const producer = new Producer(app, 'Producer');
new Consumer(app, 'Consumer', { userBucket: producer.myBucket });
new RedshiftStack(app, 'RedshiftStack');