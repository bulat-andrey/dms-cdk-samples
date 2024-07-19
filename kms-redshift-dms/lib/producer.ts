import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class Producer extends cdk.Stack {
  public readonly myBucket: s3.Bucket;
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const bucket = new s3.Bucket(this, 'MyBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.myBucket = bucket;
  }
}

export interface ConsumerProps extends cdk.StackProps {
  userBucket: s3.IBucket;
}


