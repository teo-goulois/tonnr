import { describe, expect, it } from "vitest";

import { connectionOf } from "./index";

describe("what a pool is opened with, from an address and a program's settings", () => {
  it("keeps what the address says of where the database is, and lays the settings over the rest", () => {
    const opened = connectionOf(
      "postgresql://someone:p%40ss%2Fword@db.example.org:6543/app?sslmode=disable&query_timeout=600000&statement_timeout=0&application_name=theirs",
      { max: 2, query_timeout: 5000, statement_timeout: 5000 },
    );

    expect(opened).toMatchObject({
      user: "someone",
      password: "p@ss/word",
      host: "db.example.org",
      port: "6543",
      database: "app",
      application_name: "theirs",
      max: 2,
      query_timeout: 5000,
      statement_timeout: 5000,
    });
    expect(opened.connectionString).toBeUndefined();
  });

  it("takes no other address from inside the address", () => {
    const inner = "postgresql://other:secret@elsewhere.example.org/other?statement_timeout=0";
    const address = new URL("postgresql://someone:secret@db.example.org/app");
    address.searchParams.set("connectionString", inner);

    const opened = connectionOf(address.href, { statement_timeout: 5000 });

    expect(opened).toMatchObject({
      host: "db.example.org",
      database: "app",
      user: "someone",
      statement_timeout: 5000,
    });
    expect(opened.connectionString).toBeUndefined();
  });

  it("reads an address that names a socket, as the driver does", () => {
    const opened = connectionOf(
      "postgresql://someone:secret@/app?host=/var/run/postgresql&options=-c%20statement_timeout%3D0",
      { options: "-c statement_timeout=300000" },
    );

    expect(opened).toMatchObject({
      host: "/var/run/postgresql",
      database: "app",
      options: "-c statement_timeout=0 -c statement_timeout=300000",
    });
  });

  it("puts a program's options after the address's own, whatever ends those", () => {
    const options = (theirs: string | null) => {
      const address = new URL("postgresql://someone:secret@db.example.org/app");
      if (theirs !== null) address.searchParams.set("options", theirs);
      return connectionOf(address.href, { options: "-c lock_timeout=5000" }).options;
    };

    expect(options(null)).toBe("-c lock_timeout=5000");
    expect(options("-c application_name=theirs")).toBe(
      "-c application_name=theirs -c lock_timeout=5000",
    );
    // A backslash at the end would take the space that follows for its own.
    expect(options("-c application_name=theirs\\")).toBe(
      "-c application_name=theirs -c lock_timeout=5000",
    );
    // Two of them are one backslash that the address wrote, and stay.
    expect(options("-c application_name=theirs\\\\")).toBe(
      "-c application_name=theirs\\\\ -c lock_timeout=5000",
    );
    expect(options("-c application_name=theirs\\\\\\")).toBe(
      "-c application_name=theirs\\\\ -c lock_timeout=5000",
    );
    expect(connectionOf("postgresql://db.example.org/app?options=-c%20a%3Db", {}).options).toBe(
      "-c a=b",
    );
  });
});
