# aws-cdk-transcribe-translate-workflow
## Components
1. S3 Bucket for input and output
2. State Machine that utilize Transcribe and Translate
3. API Gateway and Lambda Functions for API access

# Usage
1. Upload the video to S3.
2. Submit the job to POST / with `videoKey` in the request body. Response will include `executionId`.
3. Get the job results at GET / with the `executionId`. It may take a while to be completed.