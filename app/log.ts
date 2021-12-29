function log(...data: unknown[]): void {
    if (
        data.length === 1 &&
        data[0] &&
        typeof data[0] === "object" &&
        !Array.isArray(data[0])
    ) {
        // Condition 3
        process.stderr.write(`${JSON.stringify(data[0], undefined, "  ")}\n`);
        return;
    }

    if (data.length && typeof data[0] === "string") {
        if (
            data.length === 2 &&
            data[1] &&
            typeof data[1] === "object" &&
            !Array.isArray(data[1])
        ) {
            // Condition 2B
            process.stderr.write(
                `${data[0]}\n| ${JSON.stringify(
                    data[1],
                    undefined,
                    "  "
                ).replace(/\n/g, "\n| ")}\n`
            );
            return;
        }

        if (data.length > 1) {
            // Condition 2C
            process.stderr.write(
                `${data[0]}\n| ${data
                    .slice(1)
                    .map((e) =>
                        JSON.stringify(e, undefined, "  ").replace(
                            /\n/g,
                            "\n| "
                        )
                    )
                    .join("\n")}\n`
            );
            return;
        }

        // Condition 2A
        process.stderr.write(`${JSON.stringify(data, undefined, "  ")}\n`);
        return;
    }

    // Condition 1
    process.stderr.write(`${JSON.stringify(data, undefined, "  ")}\n`);
}

export function info(...data: unknown[]): void {
    log(...data);
}

export function debug(...data: unknown[]): void {
    log(...data);
}

export function trace(...data: unknown[]): void {
    log(...data);
}

export function warn(...data: unknown[]): void {
    log(...data);
}

export function error(...data: unknown[]): void {
    log(...data);
}

export function fatal(...data: unknown[]): void {
    log(...data);
}
