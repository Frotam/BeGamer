function addNumbers(a, b) {
  // START_EDIT_LOGIC
  return a + b;
  // END_EDIT_LOGIC
}

function factorial(n) {
  // START_EDIT_LOGIC
  if (n === 0) return 1;
  return n * factorial(n - 1);
  // END_EDIT_LOGIC
}

function isPrime(n) {
  // START_EDIT_LOGIC
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
  // END_EDIT_LOGIC
}

function reverseNumber(n) {
  // START_EDIT_LOGIC
  let rev = 0;
  while (n > 0) {
    rev = rev * 10 + (n % 10);
    n = Math.floor(n / 10);
  }
  return rev;
  // END_EDIT_LOGIC
}

// START_EDIT_LOGIC
// helper functions can be added here
// END_EDIT_LOGIC

console.log(addNumbers(5, 3));
console.log(factorial(5));
console.log(isPrime(7) ? 1 : 0);
console.log(reverseNumber(123));