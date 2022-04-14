const AWS = require('aws-sdk');
const stepFunctionsClient = new AWS.StepFunctions();

// Read environment variables
const workflowBucketName = process.env.WORKFLOW_BUCKET_NAME;
const workflowStateMachineName = process.env.WORKFLOW_STATE_MACHINE_NAME;
const region = process.env.REGION;
const accountId = process.env.ACCOUNT_ID;

exports.getJobResults = async (event, context) => {
  try {  
    // Request validation
    const { executionId } = event.pathParameters;
    if (!executionId) {
      return {
        "statusCode": 400,
        "headers": {},
        "body": "executionId is missing!",
        "isBase64Encoded": false
      }
    }

    // Getting the job result
    var params = {
      executionArn: `arn:aws:states:${region}:${accountId}:execution:${workflowStateMachineName}:${executionId}`
    }
    const executionResults = await stepFunctionsClient.describeExecution(params).promise();
    console.log(executionResults);
    
    // Returning response
    return {
      "statusCode": 200,
      "headers": {},
      "body": JSON.stringify(executionResults),
      "isBase64Encoded": false
    };

  } catch (err) {
    console.log(err);
    return {
      statusCode: 500,
      body: 'Internal server error'
    }
  }
};

exports.submitJob = async (event, context) => {
  try {  
    // Request validation
    var body = JSON.parse(event.body);
    if (!body.videoKey) {
      return {
        "statusCode": 400,
        "headers": {},
        "body": "videoKey is missing!",
        "isBase64Encoded": false
      }
    }

    // Submitting the job
    var params = {
      stateMachineArn: `arn:aws:states:${region}:${accountId}:stateMachine:${workflowStateMachineName}`,
      input: JSON.stringify({
        "VideoKey": body.videoKey,
        "BucketName": workflowBucketName
      })
    }
    const execution = await stepFunctionsClient.startExecution(params).promise();
    console.log(execution);
    const executionId = execution.executionArn.split(':').pop();
    
    // Returning response
    return {
      "statusCode": 201,
      "headers": {
        "Location": `/${executionId}`
      },
      "body": JSON.stringify({
        "executionId": `${executionId}`
      }),
      "isBase64Encoded": false
    };

  } catch (err) {
    console.log(err);
    return {
      statusCode: 500,
      body: 'Internal server error'
    }
  }
};