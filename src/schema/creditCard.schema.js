const Joi = require("@hapi/joi");

const INSTRUMENT_TYPES = {
  CREDITCARD: 'CREDITCARD',
  BANKACCOUNT: 'BANKACCOUNT'
};

const CARD_SCHEMES = {
  MASTERCARD: "MASTERCARD",
  VISA: "VISA",
  AMEX: "AMEX",
  DINERS: "DINERS"
};

const CC_MASK_SCHEMES = {
  FOUR_THREE: {
    START: 4,
    END: 3,
    TOTAL_MASKED: 7
  },
  ONE_TWO: {
    START: 1,
    END: 2,
    TOTAL_MASKED: 3
  }
}; // end CC_MASK_SCHEMES

const inboundCreditCardSchema = Joi.object({
  instrumentType: Joi.string().valid( ...Object.values( INSTRUMENT_TYPES )).required(),
  cardholderName: Joi.string().min( 5 ).max( 120 ).required(),
  cardNumber: Joi.string().creditCard().required(),
  cardExpiry: Joi.string().max( 4 ).min( 4 ).regex(/^\d+$/).required(),
  cardScheme: Joi.string().valid( ...Object.keys( CARD_SCHEMES )).required(),
  cardCountry: Joi.string().min( 2 ).max( 3 ).required(),
  cardCcv: Joi.string().min( 3 ).max( 4 )
});

const tokenisedCreditCardSchema = Joi.object({
  tokenId: Joi.string().guid({version: 'uuidv4'}).required(),
  instrumentId: Joi.string().guid({version: 'uuidv4'}).required(),
  instrumentType: Joi.string().valid( ...Object.values( INSTRUMENT_TYPES )).required(),
  cardholderName: Joi.string().min( 5 ).max( 120 ).required(),
  cardExpiry: Joi.string().max( 4 ).min( 4 ).regex(/^\d+$/).required(),
  cardScheme: Joi.string().valid( ...Object.keys( CARD_SCHEMES )).required(),
  cardCountry: Joi.string().min( 2 ).max( 3 ).required(),
  cardCcv: Joi.string().min( 3 ).max( 4 ),
  maskedCardNumber: Joi.string().required(),
  encryptedCardNumber: Joi.string().required(),
  payerId: Joi.string().guid({version: 'uuidv4'}),
});

const creditCardSchema = Joi.object({
  instrumentId: Joi.string().guid({version: 'uuidv4'}).required(),
  instrumentType: Joi.string().valid( ...Object.values( INSTRUMENT_TYPES )).required(),
  cardholderName: Joi.string().min( 5 ).max( 120 ).required(),
  cardExpiry: Joi.string().max( 4 ).min( 4 ).regex(/^\d+$/).required(),
  cardScheme: Joi.string().valid( ...Object.keys( CARD_SCHEMES )).required(),
  cardCountry: Joi.string().min( 2 ).max( 3 ).required(),
  cardCcv: Joi.string().min( 3 ).max( 4 ),
  maskedCardNumber: Joi.string().required(),
  encryptedCardNumber: Joi.string().required(),
  payerId: Joi.string().guid({version: 'uuidv4'}),
});

const validate = ( schema, object, strip = true ) => {
  const { error, value } = schema.validate( object, { stripUnknown: strip } );
  if( error ) {
    throw new Error( error.details[0].message );
  }
  return value;
}; // end validate

export const validateInboundCreditCard = ( object ) => {
  return validate( inboundCreditCardSchema, object )
};
// TODO: change the name here so we can be explicitly different to card service
export const validateStoredCreditCard = ( object ) => {
  console.error( "obje : ", object );
  return validate( creditCardSchema, object )
};

export const creditCardMetadata = {
  INSTRUMENT_TYPES,
  CC_MASK_SCHEMES
};