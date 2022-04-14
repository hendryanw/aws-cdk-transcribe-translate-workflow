import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as fs from 'fs'
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class TranscribeTranslateWorkflowStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Workflows
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

    // APIs
    const submitJobLambda = new lambda.Function(this, "submit-job-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset('lambdas/workflow-controller'),
      handler: 'function.submitJob',
      timeout: Duration.seconds(60),
      environment: {
        WORKFLOW_BUCKET_NAME: bucket.bucketName,
        WORKFLOW_STATE_MACHINE_NAME: workflow.attrName,
        ACCOUNT_ID: this.account,
        REGION: this.region
      }
    });
    submitJobLambda.addToRolePolicy(iam.PolicyStatement.fromJson({
      "Effect": "Allow",
      "Action": [
        "states:StartExecution"
      ],
      "Resource": [
        `${workflow.attrArn}`
      ]
    }));

    const getJobResultsLambda = new lambda.Function(this, "get-job-results-lambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset('lambdas/workflow-controller'),
      handler: 'function.getJobResults',
      timeout: Duration.seconds(60),
      environment: {
        WORKFLOW_BUCKET_NAME: bucket.bucketName,
        WORKFLOW_STATE_MACHINE_NAME: workflow.attrName,
        ACCOUNT_ID: this.account,
        REGION: this.region
      }
    });
    getJobResultsLambda.addToRolePolicy(iam.PolicyStatement.fromJson({
      "Effect": "Allow",
      "Action": [
        "states:DescribeExecution"
      ],
      "Resource": [
        `arn:aws:states:${this.region}:${this.account}:execution:${workflow.attrName}:*`
      ]
    }));

    const workflowApi = new apigateway.RestApi(this, "workflow-api", {
      restApiName: "AWS Transcribe Translate Workflow Service",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS
      }
    });
    
    // GET /{executionId}
    workflowApi.root.addResource("{executionId}").addMethod("GET", new apigateway.LambdaIntegration(getJobResultsLambda), {}); 
    // POST /
    workflowApi.root.addMethod("POST", new apigateway.LambdaIntegration(submitJobLambda), {}); 

    // Outputs
    new CfnOutput(this, 's3-bucket-name', {
      value: bucket.bucketName
    });
    new CfnOutput(this, 'state-machine-name', {
      value: workflow.stateMachineName!
    });
  }
}
