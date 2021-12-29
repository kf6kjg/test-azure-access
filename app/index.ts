/* eslint-disable no-process-env */
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { QueryTypes } from "sequelize";
import { SequelizeOptions } from "sequelize-typescript";

import * as Log from "./log";
import { sequelizeInit, sequelizeInstance } from "./sequelize";

// = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
const KV_KEYS: Readonly<string[]> = [
    "DB_HOSTNAME",
    "DB_NAME",
    "DB_PASSWORD",
    "DB_PORT",
    "DB_USERNAME",
] as const;

// = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
async function fetchKeys(): Promise<string[]> {
    // DotEnv.config();

    if (!process.env.KV_URL) {
        // This is an error on Azure, but not on local.
        Log.warn(
            `No value set for KV_URL, must therefore be running on a local dev machine.`,
            { KV_URL: process.env.KV_URL ?? "!!!NOT SET!!!" }
        );
        if ("WEBSITE_SITE_NAME" in process.env) {
            // WEBSITE_SITE_NAME is provided by Azure App Services automatically.
            throw new Error("Attempting to start on Azure without a KV_URL");
        }
        return [];
    }

    const credential = new DefaultAzureCredential();
    const client = new SecretClient(process.env.KV_URL, credential); //auth the azure app

    const promises = KV_KEYS.map(async (key: string): Promise<string> => {
        const secretName = key.trim().replace(/_/g, "-"); //xform _ to dash used by key vault

        try {
            const secret = await client.getSecret(secretName);
            process.env[key] = secret.value;
            return `+ Set key ${key}`;
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.stack ?? error.message
                    : String(error);
            return `- Key not defined: ${key}. ${errorMessage}`;
        }
    });

    try {
        const result = await Promise.all(promises);

        Log.debug(`Set env vars`, { result });

        return result;
    } catch (e) {
        Log.error("Failed to fetch secret(s).", { error: e });
    }
    return [];
}

// = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
class MissingRequiredEnvironmentVariablesError extends Error {
    readonly azureKeysFetched?: string[];
    readonly envVarNamesMissing: string[];

    constructor(envVarNamesMissing: string[], azureKeysFetched?: string[]) {
        super(
            `Required environment variable${
                envVarNamesMissing.length ? "s" : ""
            } ${envVarNamesMissing.join(", ")} are blank or not set.`
        );

        this.azureKeysFetched = azureKeysFetched;
        this.envVarNamesMissing = envVarNamesMissing;
        this.name = "MissingRequiredEnvironmentVariableError";
    }
}

// = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
Log.debug(`STARTUP: Env vars and other details`, {
    env: {
        KV_URL: process.env.KV_URL ?? "!!!NOT SET!!!",
        NODE_ENV: process.env.NODE_ENV ?? "!!!NOT SET!!!",
    },
});

fetchKeys()
    .then((keysFetched) => {
        // Validate required env vars.

        const requiredEnvVars: string[] = ["DB_PASSWORD"];
        const missingEnvVarNames = requiredEnvVars.filter(
            (envVarName) => !(envVarName in process.env)
        );

        if (missingEnvVarNames.length) {
            throw new MissingRequiredEnvironmentVariablesError(
                missingEnvVarNames,
                keysFetched
            );
        }

        Log.debug({
            keysFetched,
            env: [...requiredEnvVars, ...keysFetched, "KV_URL"].reduce(
                (prev, key) =>
                    Object.assign(prev, {
                        [key]: process.env[key] ?? "!!!!NOT SET!!!!",
                    }),
                {} as Record<string, string>
            ),
        });
    })
    .then(async () => {
        const Config = {
            isOnProductionServer: process.env.NODE_ENV === "production",
        } as const;

        // Check DB connection
        const sequalizeOpts: SequelizeOptions & {
            dialectOptions: { charset: string; ssl?: object };
        } = {
            database: process.env.DB_NAME ?? "app",
            dialect: "mysql",
            dialectOptions: {
                charset: "utf8mb4",
            },
            define: {
                charset: "utf8mb4",
                collate: "utf8mb4_0900_ai_ci",
            },
            host: process.env.DB_HOSTNAME ?? "localhost",
            logging:
                process.env.DISABLE_SQL_LOGGING || Config.isOnProductionServer
                    ? false
                    : (sql: string): void =>
                          Log.debug("Sequelize log", { sql }),
            password: process.env.DB_PASSWORD,
            port: parseInt(process.env.DB_PORT ?? "3306"),
            username: process.env.DB_USERNAME ?? "root",
        };

        sequalizeOpts.dialectOptions.ssl = {
            ca: `-----BEGIN CERTIFICATE-----
MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQUFADBaMQswCQYDVQQGEwJJ
RTESMBAGA1UEChMJQmFsdGltb3JlMRMwEQYDVQQLEwpDeWJlclRydXN0MSIwIAYD
VQQDExlCYWx0aW1vcmUgQ3liZXJUcnVzdCBSb290MB4XDTAwMDUxMjE4NDYwMFoX
DTI1MDUxMjIzNTkwMFowWjELMAkGA1UEBhMCSUUxEjAQBgNVBAoTCUJhbHRpbW9y
ZTETMBEGA1UECxMKQ3liZXJUcnVzdDEiMCAGA1UEAxMZQmFsdGltb3JlIEN5YmVy
VHJ1c3QgUm9vdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKMEuyKr
mD1X6CZymrV51Cni4eiVgLGw41uOKymaZN+hXe2wCQVt2yguzmKiYv60iNoS6zjr
IZ3AQSsBUnuId9Mcj8e6uYi1agnnc+gRQKfRzMpijS3ljwumUNKoUMMo6vWrJYeK
mpYcqWe4PwzV9/lSEy/CG9VwcPCPwBLKBsua4dnKM3p31vjsufFoREJIE9LAwqSu
XmD+tqYF/LTdB1kC1FkYmGP1pWPgkAx9XbIGevOF6uvUA65ehD5f/xXtabz5OTZy
dc93Uk3zyZAsuT3lySNTPx8kmCFcB5kpvcY67Oduhjprl3RjM71oGDHweI12v/ye
jl0qhqdNkNwnGjkCAwEAAaNFMEMwHQYDVR0OBBYEFOWdWTCCR1jMrPoIVDaGezq1
BE3wMBIGA1UdEwEB/wQIMAYBAf8CAQMwDgYDVR0PAQH/BAQDAgEGMA0GCSqGSIb3
DQEBBQUAA4IBAQCFDF2O5G9RaEIFoN27TyclhAO992T9Ldcw46QQF+vaKSm2eT92
9hkTI7gQCvlYpNRhcL0EYWoSihfVCr3FvDB81ukMJY2GQE/szKN+OMY3EU/t3Wgx
jkzSswF07r51XgdIGn9w/xZchMB5hbgF/X++ZRGjD8ACtPhSNzkE1akxehi/oCr0
Epn3o0WC4zxe9Z2etciefC7IpJ5OCBRLbf1wbWsaY71k5h+3zvDyny67G7fyUIhz
ksLi4xaNmjICq44Y3ekQEe5+NauQrz4wlHrQMz2nZQ/1/I6eYs9HRCwBXbsdtTLS
R9I4LtD+gdwyah617jzV/OeBHRnDJELqYzmp
-----END CERTIFICATE-----
`,
        };

        Log.debug({ sequalizeOpts });
        await sequelizeInit(sequalizeOpts);

        const sequelize = await sequelizeInstance();
        const queryResults = await sequelize.query<{ version: string }>(
            "SELECT version() as version",
            { type: QueryTypes.SELECT }
        );

        Log.debug({
            mysqlData: queryResults.map((row) => ({ version: row.version })),
        });
    })
    .catch((error) => {
        Log.error(
            "Error starting up test.",
            error instanceof MissingRequiredEnvironmentVariablesError
                ? {
                      message: error.message,
                      envVarsMissing: error.envVarNamesMissing,
                      azureKeysFetched: error.azureKeysFetched,
                  }
                : error instanceof Error
                ? {
                      name: error.name,
                      message: error.message,
                      stack: error.stack,
                  }
                : { error }
        );
        process.exit(1);
    });
