import { Schema } from "effect";

/** The provider answered, but not in the format the parser was written for. */
export class FormatError extends Schema.TaggedError<FormatError>()("FormatError", {
  provider: Schema.String,
  message: Schema.String,
}) {}
