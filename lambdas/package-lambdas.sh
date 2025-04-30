#!/bin/bash
set -e

# Change to the script's directory
cd "$(dirname "$0")"

# Package the Textract Lambda
echo "Packaging Textract Lambda..."
cd textract-lambda
npm install --production
zip -r ../textract-lambda.zip index.js completion-handler.js package.json node_modules
cd ..

# Package the Chunking Lambda
echo "Packaging Chunking Lambda..."
cd chunking-lambda
npm install --production
zip -r ../chunking-lambda.zip index.js package.json node_modules
cd ..

# Package the Embeddings Lambda
echo "Packaging Embeddings Lambda..."
cd embeddings-lambda
npm install --production
zip -r ../embeddings-lambda.zip index.js package.json node_modules
cd ..

# Package the OpenSearch Lambda
echo "Packaging OpenSearch Lambda..."
cd opensearch-lambda
npm install --production
zip -r ../opensearch-lambda.zip index.js package.json node_modules
cd ..

# Package the Search Lambda
echo "Packaging Search Lambda..."
mkdir -p search-lambda/node_modules
cp taxonomy.js search-lambda/
cd search-lambda
npm install --production
zip -r ../search-lambda.zip index.js package.json taxonomy.js node_modules
cd ..

# Move zip files to correct location
echo "Moving zip files to appropriate location..."
mkdir -p ../terraform/lambdas
cp *.zip ../terraform/lambdas/

echo "Lambda packaging completed successfully."