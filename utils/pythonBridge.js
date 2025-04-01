const { spawn } = require('child_process');
const path = require('path');
const { LogManager } = require('./logger');

const logger = new LogManager().logger;

let pythonProcess;

async function initializePythonBridge() {
    try {
        const scriptPath = path.resolve(__dirname, '../scripts/startup.py');
        pythonProcess = spawn('python', [scriptPath]);

        pythonProcess.stdout.on('data', (data) => {
            logger.info(`PythonBridge stdout: ${data}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            logger.error(`PythonBridge stderr: ${data}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                logger.error(`PythonBridge process exited with code ${code}`);
                fallbackPredictionMechanism();
            }
        });

        logger.info('PythonBridge initialized');
    } catch (error) {
        logger.error('PythonBridge initialization failed:', error);
        fallbackPredictionMechanism();
    }
}

function fallbackPredictionMechanism() {
    logger.warn('Using fallback prediction mechanism');
    // Implement fallback logic here
}

async function runPrediction(data) {
    try {
        if (!pythonProcess) {
            await initializePythonBridge();
        }
        
        // Convert data to JSON string
        const inputData = JSON.stringify(data);
        
        return new Promise((resolve, reject) => {
            const childProcess = spawn('python', [path.resolve(__dirname, '../scripts/predictive_model.py'), inputData]);
            
            let result = '';
            let errorOutput = '';
            
            childProcess.stdout.on('data', (data) => {
                result += data.toString();
            });
            
            childProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                logger.error(`Python prediction error: ${data}`);
            });
            
            childProcess.on('close', (code) => {
                if (code !== 0) {
                    logger.error(`Python process exited with code ${code}`);
                    reject(new Error(`Python process failed with code ${code}: ${errorOutput}`));
                    fallbackPredictionMechanism();
                } else {
                    try {
                        resolve(JSON.parse(result));
                    } catch (error) {
                        logger.error(`Failed to parse Python output: ${error.message}`);
                        reject(error);
                    }
                }
            });
        });
    } catch (error) {
        logger.error('Error running Python prediction:', error);
        fallbackPredictionMechanism();
        return {
            prediction: Math.random() * 0.3 + 0.5,
            confidence: Math.random() * 0.2 + 0.7,
            factors: ["historical_performance", "recent_form", "team_strength"],
            timestamp: new Date().toISOString(),
            league: data.league || 'unknown',
            type: data.prediction_type || 'unknown',
            fallback: true,
            message: 'Using fallback prediction (Python error)'
        };
    }
}

module.exports = {
    initializePythonBridge,
    runPrediction
};
