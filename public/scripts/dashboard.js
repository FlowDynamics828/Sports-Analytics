document.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard page loaded');
  const apiBaseUrl = 'http://localhost:5050/api';
  // Example usage
  fetch(`${apiBaseUrl}/health`)
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error('Error:', error));
});
