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

const validate = ( schema, object ) => {
  const { error, value } = schema.validate( object, { stripUnknown: true } );
  if( error ) {
    console.log( "the error ", error );
    return error
  }
  return value;
}; // end validate

export const validateInboundCreditCard = ( object ) => {
  return validate( inboundCreditCardSchema, object )
};

export const validateStoredCreditCard = ( object ) => {
  return validate( creditCardSchema, object )
};

export const creditCardMetadata = {
  INSTRUMENT_TYPES
};