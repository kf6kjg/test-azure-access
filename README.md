# Reproduction case for Azure KeyVault access failure on ACI

## Prerequeisites

The following must be installed on your machine:

- Azure CLI
- Docker, typically Docker Desktop
- BASH or ZSH as your terminal prompt

## Test setup

1. Set up Azure CLI defaults

   ```sh
   export TEST_NAME='test-azure-access'
   export azureRegistry="$(echo "acr-$TEST_NAME" | tr -d '-')"
   export imageName="$TEST_NAME:test"
   export imageUrl="$azureRegistry.azurecr.io/$imageName"

   az configure --defaults location=eastus
   az configure --defaults group=arg-$TEST_NAME
   az configure --defaults acr=$azureRegistry
   ```

1. Build the docker image

   ```sh
   docker build . -t $TEST_NAME
   ```

1. Login to Azure CLI

   ```sh
   az login
   ```

1. Optionally [set your subscription](https://docs.microsoft.com/en-us/cli/azure/manage-azure-subscriptions-azure-cli).
1. Create Azure Resource Group (ARG)

   ```sh
   az group create --name arg-$TEST_NAME
   ```

1. Create [Azure Database for MySQL server (ADM)](https://docs.microsoft.com/en-us/azure/postgresql/quickstart-create-server-database-azure-cli)

   ```sh
   az mysql server create --name adm-$TEST_NAME --admin-user myadmin --admin-password AJunkPassword_ButThatsOKAs1tWontLastLong --sku-name GP_Gen5_2
   ```

1. Create [Azure Key Vault (AKV)](https://docs.microsoft.com/en-us/azure/key-vault/general/quick-create-cli)

   ```sh
   az keyvault create --name akv-$TEST_NAME
   az keyvault secret set --vault-name akv-$TEST_NAME --name $(echo DB_HOSTNAME | tr _ -) --value adm-$TEST_NAME
   az keyvault secret set --vault-name akv-$TEST_NAME --name $(echo DB_NAME | tr _ -) --value test
   az keyvault secret set --vault-name akv-$TEST_NAME --name $(echo DB_PASSWORD | tr _ -) --value AJunkPassword_ButThatsOKAs1tWontLastLong
   az keyvault secret set --vault-name akv-$TEST_NAME --name $(echo DB_USERNAME | tr _ -) --value myadmin
   ```

1. Create [Azure Container Registry (ACR)](https://docs.microsoft.com/en-us/azure/container-registry/container-registry-get-started-azure-cli)

   ```sh
   az acr create --name $azureRegistry --sku Standard

   export loginServer="$(az acr show --query "loginServer" --output tsv)"
   ```

1. Upload image to ACR

   ```sh
   docker tag $TEST_NAME "$imageUrl"
   az acr login
   docker push "$imageUrl"
   ```

1. Create Identity for use on the container instance

   ```sh
   export identityName=aid-$TEST_NAME

   az identity create --name "$identityName"

   export servicePrincipleId="$(az identity show --name "$identityName" --query principalId --output tsv)"
   export resourceId="$(az identity show --name "$identityName" --query id --output tsv)"
   export clientId="$(az identity show --name "$identityName" --query clientId --output tsv)"
   ```

1. Create service principal for reading from the container registry

   ```sh
   export principleName="http://$azureRegistry-pull"
   export usernameKey="$azureRegistry-pull-usr"
   export passwordKey="$azureRegistry-pull-pwd"

   az keyvault secret set --name $passwordKey --vault-name akv-$TEST_NAME --value $(az ad sp create-for-rbac --name $principleName --scopes $(az acr show --name $azureRegistry --query id --output tsv) --role acrpull --query password --output tsv)

   az keyvault secret set --name $usernameKey --vault-name akv-$TEST_NAME --value $(az ad sp show --id $principleName --query appId --output tsv)
   ```

1. Add Identity to AKV

   ```sh
   export keyVaultId="$( az keyvault show --name akv-$TEST_NAME --query id --output tsv )"

   az keyvault set-policy --name akv-$TEST_NAME --object-id $servicePrincipleId --secret-permissions get

   az role assignment create --assignee-object-id $servicePrincipleId --assignee-principal-type ServicePrincipal --role 4633458b-17de-408a-b874-0445c86b69e6 --scope $keyVaultId
   ```

1. Create [Azure Container Group and Instance (ACI)](https://docs.microsoft.com/en-us/azure/container-instances/container-instances-quickstart)

   ```sh
   export instanceName=aci-$TEST_NAME

   az container delete --name $instanceName --yes

   az container create --assign-identity $resourceId --dns-name-label $instanceName --image "$imageUrl" --name $instanceName --registry-login-server "$loginServer" --registry-password "$(az keyvault secret show --name "$passwordKey" --vault-name akv-$TEST_NAME --query value -o tsv)" --registry-username "$(az keyvault secret show --name "$usernameKey" --vault-name akv-$TEST_NAME --query value -o tsv)" --restart-policy Never --command-line '/bin/sh -c "$START_CMD | tr -cd \"\\11\\12\\15\\40-\\176\""' --environment-variables "AZURE_CREDS_CLIENT_ID=$clientId" "KV_URL=https://akv-$TEST_NAME.vault.azure.net/"
   ```

## Test case

1. Check the logs for success or failure.

   ```sh
   az container logs --name aci-$TEST_NAME
   ```

1. If the test passed, use the following command repeatedly to keep starting until the failure reproduces. Should take less than 20 attempts, usually less than 5.

   ```sh
   while ! az container start --name aci-$TEST_NAME; do echo "Retrying in 5 seconds..."; sleep 5; done && ( while true ; do if [ "$(az container show --name aci-$TEST_NAME --query containers[0].instanceView.currentState.state --output tsv)" == "Terminated" ]; then echo "Migration container stopped."; break; fi; sleep 5.0; done ) && az container logs --name aci-$TEST_NAME
   ```

## Cleanup

Remove all the test resources via the following:

```sh
az group delete --name arg-$TEST_NAME
```
