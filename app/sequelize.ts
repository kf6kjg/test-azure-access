import * as Path from "path";

import { Sequelize, SequelizeOptions } from "sequelize-typescript";

export async function preparedSequelize(
    options?: SequelizeOptions
): Promise<Sequelize> {
    const sequelizeOptions: SequelizeOptions = {
        // logging: () => {throw new Error("No logging!")},
        models: [Path.resolve(__dirname, "models/**/!(*.test).ts")],
        modelMatch: (filename, member): boolean =>
            member === filename || member.toLowerCase() === filename,
        ...options,
    };

    return Promise.resolve(new Sequelize(sequelizeOptions));
}

export const sequelizeDefaultOptions: SequelizeOptions = {};

let instance: Sequelize;

export const sequelizeInit = async (
    initOptions?: SequelizeOptions
): Promise<Sequelize> =>
    (instance = await preparedSequelize(
        Object.assign({}, sequelizeDefaultOptions, initOptions)
    ));

export const sequelizeInstance = async (): Promise<Sequelize> =>
    instance
        ? instance
        : (instance = await preparedSequelize(sequelizeDefaultOptions));
