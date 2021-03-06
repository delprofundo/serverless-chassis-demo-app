const Joi = require("@hapi/joi");

const validate = ( schema, object, strip = true ) => {
  const { error, value } = schema.validate( object, { stripUnknown: strip } );
  if( error ) {
    throw new Error( error.details[0].message );
  }
  return value;
}; // end validate
const sessionRequestSchema = Joi.object({
  redirectUrl: Joi.string().uri().required(),
  payerId: Joi.string().guid({version: 'uuidv4'})
});
export const validateSessionRequest = ( object ) => {
  return validate( sessionRequestSchema, object )
};

const EVENT_TYPES = {
  INSTRUMENT_TOKENIZED: "INSTRUMENT_TOKENIZED"
};

const MASK_SCHEMES = {
  ONE_TWO: "ONE_TWO",
  FOUR_THREE: "FOUR_THREE"
};
const REQUEST_TYPES = {
  VAULT_SESSION_REQUESTED: "VAULT_SESSION_REQUESTED",
  APPEND_INSTRUMENT_TO_SESSION: "APPEND_INSTRUMENT_TO_SESSION",
  VAULT_SESSION_SUBMITTED: "VAULT_SESSION_SUBMITTED"
};
const RECORD_TYPES = {
  INSTRUMENT_SESSION: "INSTRUMENT_SESSION",
  INSTRUMENT_RECORD: "INSTRUMENT_RECORD",
  SUBMITTED_INSTRUMENT: "SUBMITTED_INSTRUMENT",
  TOKENIZED_INSTRUMENT: "TOKENIZED_INSTRUMENT",
  INSTRUMENT_SESSION_INDEX: "INSTRUMENT_SESSION_INDEX"
};
const INTERESTING_GLOBAL_EVENTS = {
  VAULT_SESSION_REQUESTED: "VAULT_SESSION_REQUESTED",
  VAULT_SESSION_SUBMITTED: "VAULT_SESSION_SUBMITTED"
};
const RESOURCE_TYPES = {
  PAYER: "PAYER"
};
const SESSION_VARIABLES = {
  VAULT_EXPIRY_MINUTES: 20,
  SESSION_TOKEN_LENGTH: 128,
};
const JOI_ERRORS = {
  VALIDATION_ERROR: "ValidationError"
};
const ERROR_TYPES = {
  INSTRUMENT_INVALID: "INSTRUMENT_INVALID",
  SESSION_EXPIRED: "SESSION_EXPIRED",
};
export const vault_metadata = {
  ERROR_TYPES,
  EVENT_TYPES,
  INTERESTING_GLOBAL_EVENTS,
  JOI_ERRORS,
  MASK_SCHEMES,
  REQUEST_TYPES,
  RECORD_TYPES,
  RESOURCE_TYPES,
  SESSION_VARIABLES
};