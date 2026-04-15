#include <bits/stdc++.h>
using namespace std;

int addNumbers(int a, int b) {

    // START_EDIT_LOGIC

    return a + b;

    // END_EDIT_LOGIC

}

int factorial(int n) {

    // START_EDIT_LOGIC

    if (n == 0) return 1;
    return n * factorial(n - 1);

    // END_EDIT_LOGIC

}

bool isPrime(int n) {

    // START_EDIT_LOGIC

    if (n < 2) return false;
    for (int i = 2; i * i <= n; i++) {
        if (n % i == 0) return false;
    }
    return true;

    // END_EDIT_LOGIC

}

int reverseNumber(int n) {

    // START_EDIT_LOGIC

    int rev = 0;
    while (n > 0) {
        rev = rev * 10 + n % 10;
        n = n / 10;
    }
    return rev;

    // END_EDIT_LOGIC

}


// START_EDIT_LOGIC

// You can add helper functions here if needed.

// END_EDIT_LOGIC


int main() {
    cout << addNumbers(5, 3) << endl;
    cout << factorial(5) << endl;
    cout << isPrime(7) << endl;
    cout << reverseNumber(123) << endl;
}