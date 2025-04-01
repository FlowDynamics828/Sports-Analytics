/**
 * Chart Renderer Utility
 * 
 * Handles all chart and visualization rendering using D3.js
 */

// Import dependencies
import * as d3 from 'd3';

class ChartRenderer {
  /**
   * Constructor
   */
  constructor() {
    // Bind methods
    this.renderBarChart = this.renderBarChart.bind(this);
    this.renderLineChart = this.renderLineChart.bind(this);
    this.renderHeatmap = this.renderHeatmap.bind(this);
    this.renderPieChart = this.renderPieChart.bind(this);
    this.clearChart = this.clearChart.bind(this);
  }
  
  /**
   * Clear a chart container
   * @param {HTMLElement} container Chart container element
   */
  clearChart(container) {
    if (!container) return;
    d3.select(container).select('svg').remove();
  }
  
  /**
   * Render a bar chart
   * @param {HTMLElement} container Chart container element
   * @param {Object} options Chart options
   */
  renderBarChart(container, options = {}) {
    if (!container) return;
    
    // Clear previous chart
    this.clearChart(container);
    
    const {
      labels = [],
      values = [],
      title = '',
      width = container.clientWidth || 400,
      height = 200,
      margin = { top: 30, right: 20, bottom: 40, left: 40 },
      colors = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#8F00FF']
    } = options;
    
    // Calculate dimensions
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Add title
    if (title) {
      svg.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text(title);
    }
    
    // Create scales
    const x = d3.scaleBand()
      .domain(labels)
      .range([0, innerWidth])
      .padding(0.2);
    
    const y = d3.scaleLinear()
      .domain([0, d3.max(values) * 1.1])
      .range([innerHeight, 0]);
    
    // Add x axis
    svg.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'translate(-10,0)rotate(-45)')
      .style('text-anchor', 'end');
    
    // Add y axis
    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${Math.round(d * 100)}%`));
    
    // Add bars
    svg.selectAll('.bar')
      .data(values)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d, i) => x(labels[i]))
      .attr('y', d => y(d))
      .attr('width', x.bandwidth())
      .attr('height', d => innerHeight - y(d))
      .attr('fill', (d, i) => colors[i % colors.length]);
    
    // Add value labels
    svg.selectAll('.value-label')
      .data(values)
      .enter()
      .append('text')
      .attr('class', 'value-label')
      .attr('x', (d, i) => x(labels[i]) + x.bandwidth() / 2)
      .attr('y', d => y(d) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .text(d => `${Math.round(d * 100)}%`);
  }
  
  /**
   * Render a line chart
   * @param {HTMLElement} container Chart container element
   * @param {Object} options Chart options
   */
  renderLineChart(container, options = {}) {
    if (!container) return;
    
    // Clear previous chart
    this.clearChart(container);
    
    const {
      data = [],
      xField = 'x',
      yField = 'y',
      title = '',
      width = container.clientWidth || 400,
      height = 200,
      margin = { top: 30, right: 20, bottom: 40, left: 40 },
      color = '#4285F4',
      showPoints = true
    } = options;
    
    // Calculate dimensions
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Add title
    if (title) {
      svg.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text(title);
    }
    
    // Create scales
    const x = d3.scaleLinear()
      .domain(d3.extent(data, d => d[xField]))
      .range([0, innerWidth]);
    
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d[yField]) * 1.1])
      .range([innerHeight, 0]);
    
    // Add x axis
    svg.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x));
    
    // Add y axis
    svg.append('g')
      .call(d3.axisLeft(y));
    
    // Add line
    const line = d3.line()
      .x(d => x(d[xField]))
      .y(d => y(d[yField]))
      .curve(d3.curveMonotoneX);
    
    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('d', line);
    
    // Add points
    if (showPoints) {
      svg.selectAll('.point')
        .data(data)
        .enter()
        .append('circle')
        .attr('class', 'point')
        .attr('cx', d => x(d[xField]))
        .attr('cy', d => y(d[yField]))
        .attr('r', 4)
        .attr('fill', color);
    }
  }
  
  /**
   * Render a heatmap
   * @param {HTMLElement} container Chart container element
   * @param {Object} options Chart options
   */
  renderHeatmap(container, options = {}) {
    if (!container) return;
    
    // Clear previous chart
    this.clearChart(container);
    
    const {
      matrix = [],
      labels = [],
      title = '',
      width = container.clientWidth || 400,
      height = 400,
      margin = { top: 30, right: 20, bottom: 50, left: 50 },
      colorRange = ['#D8E6FF', '#4285F4', '#0B5394']
    } = options;
    
    // Calculate dimensions
    const cellSize = Math.min(
      (width - margin.left - margin.right) / labels.length,
      (height - margin.top - margin.bottom) / labels.length
    );
    
    const innerWidth = cellSize * labels.length;
    const innerHeight = cellSize * labels.length;
    
    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', innerWidth + margin.left + margin.right)
      .attr('height', innerHeight + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Add title
    if (title) {
      svg.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text(title);
    }
    
    // Create color scale
    const colorScale = d3.scaleLinear()
      .domain([-1, 0, 1])
      .range(colorRange);
    
    // Create scales
    const x = d3.scaleBand()
      .domain(labels)
      .range([0, innerWidth]);
    
    const y = d3.scaleBand()
      .domain(labels)
      .range([0, innerHeight]);
    
    // Add x axis
    svg.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'translate(-10,0)rotate(-45)')
      .style('text-anchor', 'end');
    
    // Add y axis
    svg.append('g')
      .call(d3.axisLeft(y));
    
    // Add cells
    for (let i = 0; i < labels.length; i++) {
      for (let j = 0; j < labels.length; j++) {
        svg.append('rect')
          .attr('x', x(labels[j]))
          .attr('y', y(labels[i]))
          .attr('width', cellSize)
          .attr('height', cellSize)
          .attr('fill', colorScale(matrix[i][j]))
          .attr('stroke', '#fff')
          .attr('stroke-width', 1);
        
        // Add text for correlation value
        svg.append('text')
          .attr('x', x(labels[j]) + cellSize / 2)
          .attr('y', y(labels[i]) + cellSize / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .style('font-size', '10px')
          .style('fill', matrix[i][j] > 0.5 || matrix[i][j] < -0.5 ? '#fff' : '#000')
          .text(matrix[i][j].toFixed(2));
      }
    }
  }
  
  /**
   * Render a pie chart
   * @param {HTMLElement} container Chart container element
   * @param {Object} options Chart options
   */
  renderPieChart(container, options = {}) {
    if (!container) return;
    
    // Clear previous chart
    this.clearChart(container);
    
    const {
      data = [],
      labelField = 'label',
      valueField = 'value',
      title = '',
      width = container.clientWidth || 400,
      height = 300,
      margin = { top: 30, right: 20, bottom: 30, left: 20 },
      colors = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#8F00FF']
    } = options;
    
    // Calculate dimensions
    const radius = Math.min(
      width - margin.left - margin.right,
      height - margin.top - margin.bottom
    ) / 2;
    
    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);
    
    // Add title
    if (title) {
      svg.append('text')
        .attr('x', 0)
        .attr('y', -radius - 10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text(title);
    }
    
    // Create pie generator
    const pie = d3.pie()
      .value(d => d[valueField])
      .sort(null);
    
    // Create arc generator
    const arc = d3.arc()
      .innerRadius(0)
      .outerRadius(radius);
    
    // Create outer arc for labels
    const outerArc = d3.arc()
      .innerRadius(radius * 1.1)
      .outerRadius(radius * 1.1);
    
    // Create color scale
    const colorScale = d3.scaleOrdinal()
      .domain(data.map(d => d[labelField]))
      .range(colors);
    
    // Add pie slices
    const slices = svg.selectAll('.slice')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'slice');
    
    slices.append('path')
      .attr('d', arc)
      .attr('fill', d => colorScale(d.data[labelField]))
      .attr('stroke', '#fff')
      .style('stroke-width', '2px');
    
    // Add labels
    slices.append('text')
      .attr('transform', d => {
        const pos = outerArc.centroid(d);
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        pos[0] = radius * 0.8 * (midAngle < Math.PI ? 1 : -1);
        return `translate(${pos})`;
      })
      .attr('text-anchor', d => {
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        return midAngle < Math.PI ? 'start' : 'end';
      })
      .text(d => d.data[labelField])
      .style('font-size', '12px');
    
    // Add connecting lines
    slices.append('polyline')
      .attr('points', d => {
        const pos = outerArc.centroid(d);
        const midAngle = d.startAngle + (d.endAngle - d.startAngle) / 2;
        pos[0] = radius * 0.8 * (midAngle < Math.PI ? 1 : -1);
        return [arc.centroid(d), outerArc.centroid(d), pos];
      })
      .style('fill', 'none')
      .style('stroke', '#ccc')
      .style('stroke-width', '1px');
    
    // Add percentage labels
    slices.append('text')
      .attr('transform', d => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#fff')
      .text(d => `${Math.round(d.data[valueField] * 100 / d3.sum(data, d => d[valueField]))}%`);
  }
}

// Create singleton instance
const chartRenderer = new ChartRenderer();

export { chartRenderer }; 