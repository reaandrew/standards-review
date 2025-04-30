.PHONY: init-initial init-ci init-app deploy-initial deploy-ci deploy-app clean-lambda package-lambda deploy

# Variables
INITIAL_DIR = terraform/initial_setup
CI_DIR = terraform/ci_setup
APP_DIR = terraform/app
LAMBDA_DIR = lambdas

# Initialize Terraform in each directory
init-initial:
	cd $(INITIAL_DIR) && terraform init

init-ci:
	cd $(CI_DIR) && terraform init

init-app:
	cd $(APP_DIR) && terraform init

# Deploy each Terraform component
deploy-initial:
	cd $(INITIAL_DIR) && terraform apply -auto-approve

deploy-ci: 
	cd $(CI_DIR) && terraform apply -auto-approve

# Clean, package, and deploy Lambda functions
clean-lambda:
	rm -f $(LAMBDA_DIR)/*.zip
	rm -rf $(LAMBDA_DIR)/textract-lambda/node_modules

package-lambda: clean-lambda
	cd $(LAMBDA_DIR)/textract-lambda && npm install --production
	cd $(LAMBDA_DIR)/textract-lambda && zip -r ../textract-lambda.zip index.js completion-handler.js package.json node_modules
	cd $(LAMBDA_DIR)/chunking-lambda && npm install --production
	cd $(LAMBDA_DIR)/chunking-lambda && zip -r ../chunking-lambda.zip index.js package.json node_modules
	cd $(LAMBDA_DIR)/embeddings-lambda && npm install --production
	cd $(LAMBDA_DIR)/embeddings-lambda && zip -r ../embeddings-lambda.zip index.js package.json node_modules
	mkdir -p terraform/lambdas
	cp $(LAMBDA_DIR)/textract-lambda.zip terraform/lambdas/
	cp $(LAMBDA_DIR)/chunking-lambda.zip terraform/lambdas/
	cp $(LAMBDA_DIR)/embeddings-lambda.zip terraform/lambdas/

# Deploy app (after packaging lambda)
deploy-app: package-lambda
	cd $(APP_DIR) && terraform apply -auto-approve

# Main deployment targets
deploy: deploy-initial deploy-ci deploy-app

# Initialize all Terraform directories
init: init-initial init-ci init-app