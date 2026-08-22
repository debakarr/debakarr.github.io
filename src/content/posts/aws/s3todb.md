---
title: "Serverless Workflow to Process Files Uploaded to Amazon S3"
date: "2023-05-13"
description: "This is going to be a walkthrough of one of the LAB I did in Udemy to build Serverless Workflow in AWS. The task of the LAB was to take any JSON file uploaded in S3 bucket and store the data from that in DynamoDB. Source code for diagram from diagrams import Cluster, Diagram from diagrams.aws.compute import Lambda from diagrams.aws.database import Dynamodb from diagrams.aws.integration import SQS from diagrams.aws.storage import S3 with Diagram(\"Serverless Workflow\", graph_attr={\"margin\": \"-1\"}, show=False): with Cluster(\"Amazon S3\"): s3_bucket = S3(\"JSONFilesBucket\") with Cluster(\"AWS SQS\"): dlq = SQS(\"DeadLetterQueue\") json_processing_queue = SQS(\"JSONProcessingQueue\") json_processing_queue - dlq with Cluster(\"AWS Lambda\"): lambda_function = Lambda(\"ProcessJSONFiles\") with Cluster(\"Amazon DynamoDB\"): dynamodb_table = Dynamodb(\"JSONItemTable\") s3_bucket >> json_processing_queue >> lambda_function >> dynamodb_table Thing it covers:"
categories: ["DevOps", "AWS", "S3", "SQS", "Serverless", "Lambda"]
tags: ["DevOps", "AWS", "S3", "SQS", "Serverless", "Lambda"]
draft: false
---

This is going to be a walkthrough of one of the LAB I did in Udemy to build Serverless Workflow in AWS. The task of the LAB was to take any JSON file uploaded in S3 bucket and store the data from that in DynamoDB.

![](/posts/aws/s3todb/serverless_workflow.png)

> **INFO — Source code for diagram**
> 
> ```python
> from diagrams import Cluster, Diagram
> from diagrams.aws.compute import Lambda
> from diagrams.aws.database import Dynamodb
> from diagrams.aws.integration import SQS
> from diagrams.aws.storage import S3
> 
> with Diagram("Serverless Workflow", graph_attr={"margin": "-1"}, show=False):
>     with Cluster("Amazon S3"):
>         s3_bucket = S3("JSONFilesBucket")
> 
>     with Cluster("AWS SQS"):
>         dlq = SQS("DeadLetterQueue")
>         json_processing_queue = SQS("JSONProcessingQueue")
>         json_processing_queue - dlq
> 
>     with Cluster("AWS Lambda"):
>         lambda_function = Lambda("ProcessJSONFiles")
> 
>     with Cluster("Amazon DynamoDB"):
>         dynamodb_table = Dynamodb("JSONItemTable")
> 
>     s3_bucket >> json_processing_queue >> lambda_function >> dynamodb_table
> ```

Thing it covers:

-   Efficiently process AWS S3 events using AWS SQS Message Queues.
-   Trigger AWS Lambda Function to process the message in SQS queue.
-   We can process the file in AWS Lambda Function if required.
-   Store the data to AWS DynamoDB. This is written throught the AWS Lambda Funtion.
-   IAM Role can be used to manage access.

## Creating S3 bucket for storing files

-   Navigate to [console.aws.amazon.com/console/home](https://console.aws.amazon.com/console/home)
-   Click “Services”

![](/posts/aws/s3todb/create-bucket/click-services.jpg)

-   Click “Storage”

![](/posts/aws/s3todb/create-bucket/click-storage.jpg)

-   Click “S3”

![](/posts/aws/s3todb/create-bucket/click-s3.jpg)

-   Click “Create bucket”

![](/posts/aws/s3todb/create-bucket/click-create-button1.jpg)

-   Give some unique name for bucket like “json-processing-bucket”

![](/posts/aws/s3todb/create-bucket/name-bucket.jpg)

-   Click “Create bucket”

![](/posts/aws/s3todb/create-bucket/click-create-button2.jpg)

## Creating Table in DynamoDB

-   Navigate to [console.aws.amazon.com/console/home](https://console.aws.amazon.com/console/home)
-   Click “Services”

![](/posts/aws/s3todb/create-table-in-db/click-services.jpg)

-   Click “Database”

![](/posts/aws/s3todb/create-table-in-db/click-database.jpg)

-   Click “DynamoDB”

![](/posts/aws/s3todb/create-table-in-db/click-dynamodb.jpg)

-   Click “Create table”

![](/posts/aws/s3todb/create-table-in-db/click-create-table1.jpg)

-   Give some unique name for DB Table like “JSONItemTable” and provide a primary key like “id”. This will be later used to update data via the AWS Lambda function.

![](/posts/aws/s3todb/create-table-in-db/table-data.jpg)

-   Click “Create table”

![](/posts/aws/s3todb/create-table-in-db/click-create-table2.jpg)

## Create Lambda Function

### Create role for Lambda Function

Before creating Lambda Function we can set role and limit access to what this lambda funtion can do. Basically we want this Lambda Function to:

-   Have read access to S3 bucket -> This is possible via **AmazonS3ReadOnlyAccess**
-   Receive message form SQS -> This is possible via **AWSLambdaSQSQueueExecutionRole**
-   Have write access to Dynamo DB -> **AmazonDynamoDBFullAccess**
-   Have write access to CloudWatch in case we want to debug -> **AWSLambdaBasicExecutionRole**

To create this role

-   Click “Services”

![](/posts/aws/s3todb/create-role-for-lambda/click-services.jpg)

-   Click “Security, Identity, & Compliance”

![](/posts/aws/s3todb/create-role-for-lambda/click-security-identity-compliance.jpg)

-   Click “IAM”

![](/posts/aws/s3todb/create-role-for-lambda/click-iam.jpg)

-   Click “Roles”

![](/posts/aws/s3todb/create-role-for-lambda/click-role.jpg)

-   Click “Create role”

![](/posts/aws/s3todb/create-role-for-lambda/click-create-role.jpg)

-   Select “AWS Service” and the “Lambda”

![](/posts/aws/s3todb/create-role-for-lambda/click-lambda.jpg)

-   Click “Next”
-   Filter the roles. You can filter with this “AmazonS3ReadOnlyAccess|AWSLambdaSQSQueueExecutionRole|AmazonDynamoDBFullAccess|AWSLambdaBasicExecutionRole”

![](/posts/aws/s3todb/create-role-for-lambda/filter.jpg)

![](/posts/aws/s3todb/create-role-for-lambda/select-role.jpg)

-   Click “Next”

![](/posts/aws/s3todb/create-role-for-lambda/click-next-role.jpg)

-   Provide a name to the role like “LambdaRoleForJSONItems”

![](/posts/aws/s3todb/create-role-for-lambda/give-role-name.jpg)

-   Click “Create role”

![](/posts/aws/s3todb/create-role-for-lambda/click-create-role2.jpg)

### Create Lambda Function

-   Click “Services”

![](/posts/aws/s3todb/create-lambda/click-services.jpg)

-   Click “Compute”

![](/posts/aws/s3todb/create-lambda/click-compute.jpg)

-   Click “Lambda”

![](/posts/aws/s3todb/create-lambda/click-lambda.jpg)

-   Click “Create function”

![](/posts/aws/s3todb/create-lambda/click-create-function.jpg)

-   Click “Author from scrach”

![](/posts/aws/s3todb/create-lambda/click-author-from-scrach.jpg)

-   Provide a Function name. Here I am calling it “JSONProcessingLambdaFunctionTriggeredBySQS”. Also I am going to use Python as Runtime.

![](/posts/aws/s3todb/create-lambda/config-lambda1.jpg)

-   Now we can use the role which we created and link it with this Lambda Function.

![](/posts/aws/s3todb/create-lambda/config-lambda-role.jpg)

-   Click on “Create function”

![](/posts/aws/s3todb/create-lambda/click-create-function2.jpg)

-   Next screen we can add the Lambda “Code”. I am going to add the Python Code. It is well documented.

Please open the code block below to view the complete code.

```python
import json
import logging
import random

import boto3

sqs_client = boto3.client('sqs')
dynamo_client = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Set up logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    # Log SQS event
    logger.info({
        'message': 'Received SQS event',
        'event': event,
        'awsRequestId': context.aws_request_id,
        'functionName': context.function_name
    })

    # Extract S3 event from SQS message body
    s3_event = json.loads(event['Records'][0]['body'])

    # Log S3 event
    logger.info({
        'message': 'Received S3 event',
        'event': s3_event,
        'awsRequestId': context.aws_request_id,
        'functionName': context.function_name
    })

    # Extract source bucket and key from S3 event
    src_bucket = s3_event['Records'][0]['s3']['bucket']['name']
    src_key = s3_event['Records'][0]['s3']['object']['key']

    # Set parameters for getting S3 object
    s3_params = {
        'Bucket': src_bucket,
        'Key': src_key
    }

    # Get S3 object and read its content as string
    s3_obj = s3_client.get_object(**s3_params)
    s3_body = s3_obj['Body'].read().decode('utf-8')

    # Log S3 object body
    logger.info({
        'message': 'Retrieved S3 object body',
        's3ObjectBody': s3_body,
        'awsRequestId': context.aws_request_id,
        'functionName': context.function_name
    })

    # Parse S3 object body as JSON
    item = json.loads(s3_body)

    # Generate a random ID and add it to the JSON item
    item['id'] = str(random.random() * (10**16))

    # Get DynamoDB table for processed items
    processed_items_table = dynamo_client.Table('JSONItemTable')

    # Put the JSON item into the DynamoDB table
    result = processed_items_table.put_item(Item=item)

    # Log result
    logger.info({
        'message': 'Put item into DynamoDB table',
        'result': result,
        'awsRequestId': context.aws_request_id,
        'functionName': context.function_name
    })

    return result
```

![](/posts/aws/s3todb/create-lambda/click-code.jpg)

![](/posts/aws/s3todb/create-lambda/paste-code.jpg)

-   Click “Deploy”

![](/posts/aws/s3todb/create-lambda/click-deploy.jpg)

## Application integration

Here we would like to a queue which will take the input from S3 bucket and pass it to our Lambda function.

To have high resilience we will also have a **dead-letter queue** which will be containing all the json which are not processed properly. We will have a retention of 14 days for those json items.

### Creating dead-letter queue

-   Click “Services”

![](/posts/aws/s3todb/create-queue/click-services.jpg)

-   Click “Application Integration”

![](/posts/aws/s3todb/create-queue/click-application-integration.jpg)

-   Click “Simple Queue Service”

![](/posts/aws/s3todb/create-queue/click-simple-queue-service.jpg)

-   Click “Create queue”

![](/posts/aws/s3todb/create-queue/click-create-queue.jpg)

-   Provide a name to dead-letter queue. Here I am giving it a name “JSONDeadLetterQueue”

![](/posts/aws/s3todb/create-queue/dead-letter-queue-config.jpg)

-   We can also set the retention policy. For now I am setting it to 14 days.

![](/posts/aws/s3todb/create-queue/dead-letter-queue-config2.jpg)

-   Click “Create queue”.

![](/posts/aws/s3todb/create-queue/click-create-queue2.jpg)

### Create queue for S3 bucket event notification

-   Click back “Queue”

![](/posts/aws/s3todb/create-queue/click-back-queue.jpg)

-   Click “Create queue” again.

![](/posts/aws/s3todb/create-queue/click-create-queue3.jpg)

-   Set the name for the queue. I am naming it “JSONProcessingQueue”.

![](/posts/aws/s3todb/create-queue/queue-config.jpg)

-   Next step will be to modify the access policy for the queue. For this you will need the account ID as well as the S3 bucket name. You can get the account ID under the profile name.

![](/posts/aws/s3todb/create-queue/copy-account-number.jpg)

-   Under “Access policy” click on “Advanced” and paste the following json.

> **WARNING — Replace with yours**
> 
> Please note that you will have to modify it as per your account name and S3 bucket name.

```json
{
  "Version": "2012-10-17",
  "Id": "JSONProcessingQueue-ID",
  "Statement": [
    {
      "Sid": "JSONProcessingQueue-statement-ID",
      "Effect": "Allow",
      "Principal": {
        "AWS": "*"
      },
      "Action": "SQS:SendMessage",
      "Resource": "arn:aws:sqs:us-east-1:CHANGE-WITH-YOUR-ACCOUNT-ID:JSONProcessingQueue",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "CHANGE-WITH-YOUR-ACCOUNT-ID"
        },
        "ArnLike": {
          "aws:SourceArn": "arn:aws:s3:*:*:CHANGE-WITH-YOUR-BUCKET-NAME"
        }
      }
    }
  ]
}
```

![](/posts/aws/s3todb/create-queue/modify-access-policy.jpg)

-   Select the dead-letter queue we had created in the previous section.

![](/posts/aws/s3todb/create-queue/set-dead-queue.jpg)

-   Click “Create queue”

![](/posts/aws/s3todb/create-queue/click-create-queue4.jpg)

-   Click “Lambda triggers”

![](/posts/aws/s3todb/create-queue/click-lambda-trigger.jpg)

-   Click “Configure Lambda function trigger”

![](/posts/aws/s3todb/create-queue/click-configure-lambda-function.jpg)

-   Select the lambda function which we created before.

![](/posts/aws/s3todb/create-queue/select-the-lambda-function.jpg)

-   Click “Save”

![](/posts/aws/s3todb/create-queue/click-save.jpg)

## Push event notification from S3 to SQS

-   Click “Services”

![](/posts/aws/s3todb/s3-event-notification/click-services.jpg)

-   Click “Storage”

![](/posts/aws/s3todb/s3-event-notification/click-storage.jpg)

-   Click “S3”

![](/posts/aws/s3todb/s3-event-notification/click-s3.jpg)

-   Click “json-processing-bucket” (Your bucket name might be different)

![](/posts/aws/s3todb/s3-event-notification/click-json-processing-bucket.jpg)

-   Click “Properties”

![](/posts/aws/s3todb/s3-event-notification/click-properties.jpg)

-   Click “Create event notification”

![](/posts/aws/s3todb/s3-event-notification/click-create-event-notification.jpg)

-   Give the event notification a name. I have give name as “sqs-event-notification”. Also I have given access to All object creation. So anytime a new object is pushed to S3, it will trigger a event to the SQS.

![](/posts/aws/s3todb/s3-event-notification/event-notification-config.jpg)

-   We can link the SQS under “Destination”

![](/posts/aws/s3todb/s3-event-notification/sqs-under-destination.jpg)

-   Click “Save changes”

![](/posts/aws/s3todb/s3-event-notification/click-save-changes.jpg)

## Try out to see if the DynamoDB database is getting updated on new push

-   Click “Services”

![](/posts/aws/s3todb/upload-to-s3/click-services.jpg)

-   Click “Storage”

![](/posts/aws/s3todb/upload-to-s3/click-storage.jpg)

-   Click “S3”

![](/posts/aws/s3todb/upload-to-s3/click-s3.jpg)

-   Click “json-processing-bucket”

![](/posts/aws/s3todb/upload-to-s3/click-json-processing-bucket.jpg)

-   Click “Upload”

![](/posts/aws/s3todb/upload-to-s3/click-upload.jpg)

-   Click “Add files”

![](/posts/aws/s3todb/upload-to-s3/click-add-files.jpg)

-   Click “Upload” and select the file. For demostration purpose try to upload a valid JSON file

![](/posts/aws/s3todb/upload-to-s3/upload.jpg)

-   Click “Services”

![](/posts/aws/s3todb/upload-to-s3/click-services.jpg)

-   Click “Database”

![](/posts/aws/s3todb/upload-to-s3/click-database.jpg)

-   Click “DynamoDB”

![](/posts/aws/s3todb/upload-to-s3/click-dynamo-db.jpg)

-   Click “Tables”

![](/posts/aws/s3todb/upload-to-s3/click-tables.jpg)

-   Click “JSONItemTable”

![](/posts/aws/s3todb/upload-to-s3/click-json-item-table.jpg)

-   Click “Explore table items”

![](/posts/aws/s3todb/upload-to-s3/click-explore-table-items.jpg)

-   Verify that the data is uploaded properly

![](/posts/aws/s3todb/upload-to-s3/verify-data.jpg)

That covers the whole process of deploying a simple serverless application using AWS lambda.
