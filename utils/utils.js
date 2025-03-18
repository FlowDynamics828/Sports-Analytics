const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normal = (mean, stdDev) => {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
};

module.exports = {
    clamp,
    normal
};
