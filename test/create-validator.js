'use strict';

const should = require('should');
const Promise = require('bluebird');
const _ = require('lodash');
const {
  createValidator,
  util: { oneOfRules, when, msgFor },
  rules: { isString, isInteger, oneOfArray }
} = require('./../index');

describe('Validators creation', () => {
  const testValues = {
    deal: 'purchase',
    car: {
      make: 'BMW',
      model: '5-er',
      engine: {
        displacement: 4,
        cylinders: 6,
      },
    },
    owner: {
      name: 'Rick',
      surname: 'Astley',
    },
  };

  const notFailingAsyncValidationRule = () => Promise.resolve();
  const failingAsyncValidationRule = () => Promise.resolve('Some error');

  const validMakes = ['BMW', 'Mercedes', 'Audi'];
  const validModels = ['3-er', '5-er', '7-er'];

  describe('handling of objects with enclosed properties', () => {
    it('should perform validation', () => {
      const validateAsync = createValidator({
        deal: [isString, notFailingAsyncValidationRule],
        car: {
          make: [oneOfArray(validMakes), notFailingAsyncValidationRule],
          model: [oneOfArray(validModels), notFailingAsyncValidationRule],
          engine: {
            displacement: [isInteger, oneOfRules([notFailingAsyncValidationRule, failingAsyncValidationRule])],
            cylinders: [isInteger, notFailingAsyncValidationRule],
          },
        },
        owner: {
          name: [isString, notFailingAsyncValidationRule],
          surname: [isString, notFailingAsyncValidationRule],
        },
      });

      return validateAsync(testValues)
        .then(errors => {
          should(errors).be.undefined();
        });
    });

    it('should pass the whole form data as second argument', () => {
      let dealPropertyWasAvailable = true;
      const validateEnclosedObject = (value, data) => {
        if (data.deal !== testValues.deal) {
          dealPropertyWasAvailable = false;
        }
      };

      const validateAsync = createValidator({
        deal: isString,
        car: {
          make: [oneOfArray(validMakes), validateEnclosedObject],
          engine: {
            cylinders: validateEnclosedObject,
          },
        },
      });

      return validateAsync(testValues)
        .then(errors => {
          should(errors).be.undefined();
          dealPropertyWasAvailable.should.be.true('"deal" property was not available');
        });
    });
  });

  it('should populate errors object correctly when validation fails', () => {
    const validateAsync = createValidator({
      deal: [isString, failingAsyncValidationRule],
      car: {
        make: [oneOfArray(validMakes), notFailingAsyncValidationRule],
        model: [oneOfArray(validModels), notFailingAsyncValidationRule],
        engine: {
          displacement: [isInteger, oneOfRules([notFailingAsyncValidationRule, failingAsyncValidationRule])],
          cylinders: [isInteger, failingAsyncValidationRule],
        },
      },
      owner: {
        name: [isString, notFailingAsyncValidationRule],
        surname: [isString, notFailingAsyncValidationRule],
      },
    });

    const thisCaseTestValues = _.cloneDeep(testValues);
    delete thisCaseTestValues.car.engine.cylinders;
    delete thisCaseTestValues.deal;

    return validateAsync(thisCaseTestValues)
      .then(errors => {
        should(errors).be.an.Object();
        Object.keys(errors).should.have.lengthOf(2);

        errors.car.engine.cylinders.should.be.a.String();
        errors.deal.should.be.a.String();
      });
  });

  it('should perform a validation of an attribute in series by default', () => {
    let firstRuleWasExecuted = false;
    let secondRuleWasExecutedAfterFirst = false;

    const firstRule = () => Promise.delay(100).then(() => {
      firstRuleWasExecuted = true;
      return Promise.resolve();
    });
    const secondRule = () => Promise.resolve().then(() => {
      if (firstRuleWasExecuted) {
        secondRuleWasExecutedAfterFirst = true;
      }
      return Promise.resolve();
    });

    return createValidator({ someName: [firstRule, secondRule] })({ someName: 'someValue' })
      .then(errors => {
        should(errors).be.undefined();
        secondRuleWasExecutedAfterFirst.should.be.true();
      });
  });

  it('should stop execution of rules on first error by default', () => {
    let secondRuleWasExecuted = false;

    const firstRule = () => Promise.resolve('Some error description');
    const secondRule = () => {
      secondRuleWasExecuted = true;
      return Promise.resolve();
    };

    return createValidator({ someName: [firstRule, secondRule] })({ someName: 'someValue' })
      .then(errors => {
        should(errors).be.an.Object();
        errors.should.have.property('someName');
        secondRuleWasExecuted.should.be.false();
      });
  });

  describe('usage of when helper', () => {
    it('should not execute enclosed object rules if predicate is false', () => {
      let validationOfCarWasPerformed = false;

      const validateCar = () => {
        validationOfCarWasPerformed = true;
        return Promise.resolve('Some error description');
      };
      const validateAsync = createValidator({
        deal: [isString],
        car: when(false, {
          make: [oneOfArray(validMakes), validateCar],
          model: [oneOfArray(validModels), validateCar],
          engine: {
            displacement: [isInteger, validateCar],
            cylinders: [isInteger, validateCar],
          },
        }),
        owner: {
          name: [isString, notFailingAsyncValidationRule],
          surname: [isString, notFailingAsyncValidationRule],
        },
      });

      return validateAsync(testValues)
        .then(errors => {
          should(errors).be.undefined();
          validationOfCarWasPerformed.should.be.false();
        });
    });

    it('should execute enclosed object rules if predicate is true', () => {
      const errorDescription = 'Some error description';
      let validationOfCarWasPerformed = false;

      const validateCar = () => {
        validationOfCarWasPerformed = true;
        return Promise.resolve(errorDescription);
      };
      const validateAsync = createValidator({
        deal: isString,
        car: when(true, {
          make: [oneOfArray(validMakes), validateCar],
          model: [oneOfArray(validModels), validateCar],
          engine: {
            displacement: [isInteger, validateCar],
            cylinders: [isInteger, validateCar],
          },
        }),
        owner: {
          name: [isString, notFailingAsyncValidationRule],
          surname: [isString, notFailingAsyncValidationRule],
        },
      });

      return validateAsync(testValues)
        .then(errors => {
          should(errors).be.Object();
          errors.should.containEql({
            car: {
              make: errorDescription,
              model: errorDescription,
              engine: {
                displacement: errorDescription,
                cylinders: errorDescription,
              },
            },
          });
          validationOfCarWasPerformed.should.be.true();
        });
    });

    it('should not execute any rules if promise is supplied that resolves with falsy value', () => {
      return createValidator({ make: when(Promise.resolve(false), isString) })({ make: 123 })
        .then(errors => {
          should(errors).be.undefined();
        });
    });

    it('should pass whole data if `when` is applied within an enclosed object', () => {
      let dealPropertyWasAvailable = true;
      const returnsTrue = (value, data) => {
        if (data.deal !== testValues.deal) {
          dealPropertyWasAvailable = false;
        }
        return true;
      };

      const validateAsync = createValidator({
        deal: isString,
        car: when(returnsTrue, {
          make: when(returnsTrue, oneOfArray(validMakes)),
          engine: {
            cylinders: when(returnsTrue, isInteger),
          },
        }),
      });

      return validateAsync(testValues)
        .then(errors => {
          should(errors).be.undefined();
          dealPropertyWasAvailable.should.be.true('"deal" property was not available');
        });
    });
  });

  describe('usage of msgFor helper', () => {
    const customErrorMessage = 'Custom error message';

    it('should allow for async rules', () => {
      return createValidator({ make: msgFor(failingAsyncValidationRule, customErrorMessage) })({ make: 'some value' })
        .then(errors => {
          should(errors).be.an.Object();
          errors.make.should.be.a.String();
          errors.make.should.eql(customErrorMessage);
        });
    });

    it('should allow for enclosed objects', () => {
      return createValidator({ car: msgFor({ make: failingAsyncValidationRule }, customErrorMessage) })({ car: {} })
        .then(errors => {
          should(errors).be.an.Object();
          errors.car.should.be.a.String();
          errors.car.should.eql(customErrorMessage);
        });
    });

    it('should pass whole data if `msgFor` is applied within an enclosed object', () => {
      const customErrorMessage = 'Custom error message';
      let dealPropertyWasAvailable = true;
      const notFailingRule = (value, data) => {
        if (data.deal !== testValues.deal) {
          dealPropertyWasAvailable = false;
        }
      };

      const validateAsync = createValidator({
        deal: isString,
        car: msgFor({
          make: msgFor(notFailingRule, customErrorMessage),
          engine: {
            cylinders: msgFor(notFailingRule, customErrorMessage),
          },
        }, customErrorMessage),
      });

      return validateAsync(testValues)
        .then(errors => {
          should(errors).be.undefined();
          dealPropertyWasAvailable.should.be.true('"deal" property was not available');
        });
    });

  });
});
