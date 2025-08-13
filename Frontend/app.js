// Function to get and show all customers in the table
async function fetchCustomers() {
  // Get customers from backend
  const res = await fetch('http://localhost:3000/customers');
  const data = await res.json();
  // Find the table body
  const tbody = document.querySelector('#customers-table tbody');
  tbody.innerHTML = '';
  // Add each customer to the table
  data.forEach(c => {
    tbody.innerHTML += `<tr>
      <td>${c.customer_id}</td>
      <td><span class="customer-name">${c.name}</span></td>
      <td>${c.identification_number}</td>
      <td>${c.address}</td>
      <td>${c.phone}</td>
      <td>${c.email}</td>
      <td>
        <button class="edit-btn" data-id="${c.customer_id}" data-name="${c.name}">Edit</button>
        <button class="delete-btn" data-id="${c.customer_id}">Delete</button>
      </td>
    </tr>`;
  });

  // Add event to delete buttons
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = async e => {
      const id = btn.getAttribute('data-id');
      // Ask user before delete
      if (confirm('Are you sure you want to delete this user?')) {
        await fetch(`http://localhost:3000/customers/${id}`, { method: 'DELETE' });
        fetchCustomers(); // Refresh table
      }
    };
  });

  // Add event to edit buttons
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = async e => {
      const id = btn.getAttribute('data-id');
      const oldName = btn.getAttribute('data-name');
      // Ask for new name
      const newName = prompt('New name:', oldName);
      if (newName && newName !== oldName) {
        await fetch(`http://localhost:3000/customers/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName })
        });
        fetchCustomers(); // Refresh table
      }
    };
  });
}

// Event for add customer form
document.getElementById('customer-form').onsubmit = async e => {
  e.preventDefault(); // Stop page reload
  const form = e.target;
  // Get form data
  const body = Object.fromEntries(new FormData(form));
  // Send data to backend
  await fetch('http://localhost:3000/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  form.reset(); // Clear form
  fetchCustomers(); // Refresh table
};

// Event for upload CSV form
document.getElementById('upload-form').onsubmit = async e => {
  e.preventDefault(); // Stop page reload
  const formData = new FormData(e.target);
  // Send file to backend
  await fetch('http://localhost:3000/customers/upload', {
    method: 'POST',
    body: formData
  });
  fetchCustomers(); // Refresh table
};

// Event for reload button
document.getElementById('reload-btn').onclick = fetchCustomers;

// Load customers when page starts
fetchCustomers();
