import bcrypt from 'bcrypt';

async function testPasswordHash() {
  const password = 'admin123';
  const storedHash = '$2b$10$WqwXjMeRiCEISbf38wOfi.5Miiqscr0WgQXN1OQ8hu4PMHp5M3s9O';
  
  console.log('Testing password comparison:');
  console.log('Password:', password);
  console.log('Stored hash:', storedHash);
  
  const isMatch = await bcrypt.compare(password, storedHash);
  console.log('Password matches:', isMatch);
  
  // Generate a new hash for verification
  const newHash = await bcrypt.hash(password, 10);
  console.log('New hash generated:', newHash);
  
  return isMatch;
}

testPasswordHash().then(result => {
  console.log('Test completed with result:', result);
}).catch(console.error);
