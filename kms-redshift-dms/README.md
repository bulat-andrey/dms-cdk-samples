# Welcome to your CDK TypeScript project

**KmsSecretsManagerRedshiftDMStack** consists:
- VPC
- VPC endpoint for SecretsManager
- KMSkey 
- 2 SecretsManagers Secrets w/ KMS encryption (initial with correct password for Redshift excluding DMS Endpoint prohibited spec characters and DMS Endpoint SecretsManager with all keys: `username, password, host, port`)
- DMS replication instance w/ KMS encryption in private subnets (that's why VPC SecretsManager endpoint is needed and private sbunets CIDRs in DMS Security Group)
- Redshift w/ KMS in public subnets + Redshift Subnet Group
- DMSEndpointIAMrole with all necessary permissions
- DMSBucket
- DMSEndpoint

#### It was deployed successfully with CDK v2.149 and DMS endpoint using SecretsManager successfully tested against Redshift target.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

# Getting Started with AWS CDK for TypeScript

The AWS Cloud Development Kit (CDK) is an open-source software development framework that allows you to define your cloud infrastructure using programming languages like TypeScript, Python, Java, and C#. In this guide, we'll walk through the steps to set up and run a CDK project in TypeScript.

## Prerequisites

Before you begin, ensure that you have the following installed:

1. **Node.js** (version 12.x or later): You can download it from the official [Node.js website](https://nodejs.org).
2. **AWS CLI**: Install the AWS Command Line Interface (CLI) by following the instructions on the [AWS CLI documentation](https://aws.amazon.com/cli/).
3. **AWS Account**: You'll need an AWS account to deploy your CDK application. If you don't have one, you can create a new account on the [AWS website](https://aws.amazon.com).

## Step 1: Install the AWS CDK Toolkit

The AWS CDK Toolkit is a command-line tool that helps you work with CDK applications. You can install it globally using the Node Package Manager (npm):  
`npm install -g aws-cdk`  
Configure AWS credentials `aws configure` or create aws profile (for run with profile add `--profile=<profile_name>`) 

## Step 2: Run the code

In CLI navigate to folder 'kms-redshift-dms'  
`cd kms-redshift-dms`

Check if CDK app can be synthesized to CloudFormation template  
`cdk synth KmsSecretsmanagerRedshiftDMStack --profile=dev`  

Deploy the stack
`cdk deploy KmsSecretsmanagerRedshiftDMStack --profile=dev`

### CleanUp:  
delete test file from Bucket before Cloudformation deletion. Or at any time and Retry deletion from Web console UI.  
after bucket empty you can initiate deletion from CLI:  
`cdk destroy KmsSecretsmanagerRedshiftDMStack --profile=dev`   
and Yes in the command line OR delete the Cfn from console UI

---


