import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import {ConsumerProps} from "./producer";


export class Consumer extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: ConsumerProps) {
    super(scope, id, props);
    const user = new iam.User(this, 'MyUser');
    props.userBucket.grantReadWrite(user);
  }
}