function errorHandler(err, req, res, next) {
    console.error('Error:', err);
    
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
}

module.exports = errorHandler;