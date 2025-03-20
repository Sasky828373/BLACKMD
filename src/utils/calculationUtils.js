/**
 * Calculation Utilities
 * Provides centralized implementation of mathematical and calculation operations
 * Used to consolidate duplicate calculation commands across modules
 */

const mathjs = require('mathjs');
const logger = require('./logger');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs').promises;
const path = require('path');

/**
 * Safely evaluate a mathematical expression
 * @param {string} expression Mathematical expression to evaluate
 * @param {Object} options Configuration options
 * @param {boolean} options.simplify Whether to simplify the result
 * @param {number} options.precision Decimal precision for the result
 * @param {Object} options.scope Variables to use in the calculation
 * @returns {Object} Result object with value, error (if any), and formatted result
 */
function calculate(expression, options = {}) {
  const {
    simplify = true,
    precision = 4,
    scope = {}
  } = options;
  
  const result = {
    value: null,
    error: null,
    formatted: null
  };
  
  try {
    // Sanitize input to prevent code execution
    if (typeof expression !== 'string') {
      throw new Error('Expression must be a string');
    }
    
    // Define unsafe patterns
    const unsafePatterns = [
      /import\s*\(/i,
      /require\s*\(/i,
      /process/i,
      /constructor/i,
      /__proto__/i,
      /prototype/i,
      /eval\s*\(/i,
      /Function\s*\(/i,
      /setTimeout\s*\(/i,
      /setInterval\s*\(/i,
      /new\s+Function/i
    ];
    
    // Check for unsafe patterns
    for (const pattern of unsafePatterns) {
      if (pattern.test(expression)) {
        throw new Error('Expression contains unsafe operations');
      }
    }
    
    // Use mathjs to safely evaluate the expression
    let parsedExpression;
    if (simplify) {
      parsedExpression = mathjs.simplify(expression);
      result.value = mathjs.evaluate(parsedExpression.toString(), scope);
    } else {
      result.value = mathjs.evaluate(expression, scope);
    }
    
    // Format the result
    if (typeof result.value === 'number') {
      result.formatted = mathjs.format(result.value, { precision });
    } else {
      result.formatted = result.value.toString();
    }
  } catch (error) {
    result.error = error.message;
    logger.error(`Calculation error: ${error.message}`);
  }
  
  return result;
}

/**
 * Solve an equation for a variable
 * @param {string} equation Equation to solve (e.g., "x + 5 = 10")
 * @param {string} variable Variable to solve for (e.g., "x")
 * @returns {Object} Result object with solutions and error (if any)
 */
function solveEquation(equation, variable = 'x') {
  const result = {
    solutions: [],
    error: null
  };
  
  try {
    // Standardize equation format (ensure it has an equals sign)
    if (!equation.includes('=')) {
      equation = `${equation} = 0`;
    }
    
    // Parse the equation
    const sides = equation.split('=').map(side => side.trim());
    
    // Create a normalized form: left - right = 0
    const normalizedEquation = `${sides[0]} - (${sides[1]})`;
    
    // Use mathjs to solve the equation
    const solutions = mathjs.solve(normalizedEquation, variable);
    
    // Format results
    result.solutions = Array.isArray(solutions) 
      ? solutions.map(sol => mathjs.format(sol, { precision: 4 }))
      : [mathjs.format(solutions, { precision: 4 })];
  } catch (error) {
    result.error = error.message;
    logger.error(`Equation solving error: ${error.message}`);
  }
  
  return result;
}

/**
 * Generate a chart for a mathematical function
 * @param {string} equation Mathematical function to plot (e.g., "x^2 + 2*x - 1")
 * @param {Object} options Chart options
 * @param {number[]} options.xRange Range of x values [min, max]
 * @param {number} options.width Chart width in pixels
 * @param {number} options.height Chart height in pixels
 * @param {string} options.color Chart line color
 * @returns {Promise<Object>} Result with buffer and error (if any)
 */
async function generateMathChart(equation, options = {}) {
  const {
    xRange = [-10, 10],
    width = 800,
    height = 600,
    color = 'rgb(75, 192, 192)'
  } = options;
  
  const result = {
    buffer: null,
    error: null
  };
  
  try {
    const chartCallback = (ChartJS) => {
      ChartJS.defaults.color = '#666';
    };
    
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
      width, 
      height, 
      chartCallback 
    });
    
    const points = [];
    const step = (xRange[1] - xRange[0]) / 100;
    
    for (let x = xRange[0]; x <= xRange[1]; x += step) {
      try {
        const scope = { x };
        const y = mathjs.evaluate(equation, scope);
        
        if (typeof y === 'number' && isFinite(y)) {
          points.push({ x, y });
        }
      } catch (e) {
        continue; // Skip points that can't be evaluated
      }
    }
    
    const data = {
      datasets: [{
        label: equation,
        data: points,
        borderColor: color,
        tension: 0.1,
        fill: false
      }]
    };
    
    const config = {
      type: 'line',
      data: data,
      options: {
        responsive: true,
        scales: {
          x: {
            type: 'linear',
            position: 'center'
          },
          y: {
            type: 'linear',
            position: 'center'
          }
        }
      }
    };
    
    result.buffer = await chartJSNodeCanvas.renderToBuffer(config);
  } catch (error) {
    result.error = error.message;
    logger.error(`Chart generation error: ${error.message}`);
  }
  
  return result;
}

/**
 * Perform unit conversion
 * @param {number} value Value to convert
 * @param {string} fromUnit Original unit
 * @param {string} toUnit Target unit
 * @returns {Object} Result with converted value and error (if any)
 */
function convertUnits(value, fromUnit, toUnit) {
  const result = {
    value: null,
    error: null,
    formatted: null
  };
  
  try {
    const converted = mathjs.unit(value, fromUnit).to(toUnit);
    result.value = converted.value;
    result.formatted = `${mathjs.format(converted.value, { precision: 4 })} ${toUnit}`;
  } catch (error) {
    result.error = error.message;
    logger.error(`Unit conversion error: ${error.message}`);
  }
  
  return result;
}

/**
 * Calculate statistics for a dataset
 * @param {number[]} data Array of numbers
 * @returns {Object} Statistical measures
 */
function calculateStatistics(data) {
  const result = {
    mean: null,
    median: null,
    mode: null,
    min: null,
    max: null,
    range: null,
    standardDeviation: null,
    variance: null,
    sum: null,
    count: null,
    error: null
  };
  
  try {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Data must be a non-empty array of numbers');
    }
    
    // Convert all items to numbers and filter out NaN values
    const numericData = data
      .map(item => typeof item === 'string' ? parseFloat(item) : item)
      .filter(item => typeof item === 'number' && !isNaN(item));
    
    if (numericData.length === 0) {
      throw new Error('No valid numeric data found');
    }
    
    result.mean = mathjs.mean(numericData);
    result.median = mathjs.median(numericData);
    result.min = Math.min(...numericData);
    result.max = Math.max(...numericData);
    result.range = result.max - result.min;
    result.standardDeviation = mathjs.std(numericData);
    result.variance = mathjs.variance(numericData);
    result.sum = mathjs.sum(numericData);
    result.count = numericData.length;
    
    // Calculate mode (may have multiple values)
    const frequency = {};
    let maxFreq = 0;
    
    for (const num of numericData) {
      frequency[num] = (frequency[num] || 0) + 1;
      if (frequency[num] > maxFreq) {
        maxFreq = frequency[num];
      }
    }
    
    if (maxFreq > 1) {
      result.mode = Object.keys(frequency)
        .filter(key => frequency[key] === maxFreq)
        .map(key => parseFloat(key));
    } else {
      result.mode = 'No mode (all values occur once)';
    }
  } catch (error) {
    result.error = error.message;
    logger.error(`Statistics calculation error: ${error.message}`);
  }
  
  return result;
}

/**
 * Evaluate a mathematical derivative
 * @param {string} expression Mathematical expression to differentiate
 * @param {string} variable Variable to differentiate with respect to
 * @returns {Object} Result with derivative expression
 */
function calculateDerivative(expression, variable = 'x') {
  const result = {
    derivative: null,
    error: null
  };
  
  try {
    const node = mathjs.parse(expression);
    const derivative = mathjs.derivative(node, variable);
    result.derivative = derivative.toString();
  } catch (error) {
    result.error = error.message;
    logger.error(`Derivative calculation error: ${error.message}`);
  }
  
  return result;
}

/**
 * Calculate the integral of an expression
 * @param {string} expression Mathematical expression to integrate
 * @param {string} variable Variable to integrate with respect to
 * @param {Object} options Integration options
 * @param {number[]} options.limits Integration limits [lower, upper] for definite integral
 * @returns {Object} Result with integral expression or value
 */
function calculateIntegral(expression, variable = 'x', options = {}) {
  const { limits } = options;
  const result = {
    integral: null,
    value: null,
    error: null
  };
  
  try {
    // Check if this is a definite integral
    if (Array.isArray(limits) && limits.length === 2) {
      const [lower, upper] = limits;
      
      // Use numerical integration for definite integral
      const integral = mathjs.integrate(expression, variable, lower, upper);
      result.value = integral;
    } else {
      // For indefinite integrals, use symbolic integration if possible
      // Note: mathjs has limited symbolic integration capabilities
      result.integral = `∫${expression} d${variable}`;
      result.error = 'Symbolic integration is limited in this implementation';
    }
  } catch (error) {
    result.error = error.message;
    logger.error(`Integral calculation error: ${error.message}`);
  }
  
  return result;
}

module.exports = {
  calculate,
  solveEquation,
  generateMathChart,
  convertUnits,
  calculateStatistics,
  calculateDerivative,
  calculateIntegral
};