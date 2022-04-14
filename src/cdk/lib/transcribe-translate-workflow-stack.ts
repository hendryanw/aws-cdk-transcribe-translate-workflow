import * as fs from 'fs'
import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export class TranscribeTranslateWorkflowStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'input-output-bucket', {
      versioned: false,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const iamRole = new iam.Role(this, 'workflow-role', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXrayFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonTranscribeFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('TranslateFullAccess'),
      ]
    });

    const logGroup = new logs.LogGroup(this, 'workflow-log-group', {
      removalPolicy: RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_MONTH
    });

    const workflow = new stepfunctions.CfnStateMachine(this, 'workflow', {
      stateMachineName: "transcribe-translate-workflow",
      roleArn: iamRole.roleArn,
      definitionString: fs.readFileSync("./lib/workflow-definition.json").toString(),
      loggingConfiguration: {
        destinations: [{
          cloudWatchLogsLogGroup: {
            logGroupArn: logGroup.logGroupArn,
          },
        }],
        includeExecutionData: false,
        level: 'ERROR',
      },
      tracingConfiguration: {
        enabled: true
      }
    });

    new CfnOutput(this, 's3-bucket-name', {
      value: bucket.bucketName
    });

    new CfnOutput(this, 'state-machine-name', {
      value: workflow.stateMachineName!
    });
  }
}
