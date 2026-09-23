#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]
#[macro_use]
extern crate alloc;
use alloc::vec::Vec;

use stylus_sdk::{alloy_primitives::U256, prelude::*};

sol_storage! {
    #[entrypoint]
    pub struct GiftedMatcher {}
}

/// Pure trigger logic shared with the Solidity broker: price must be positive,
/// current time must not exceed expiry, and price must be at or below the cap.
#[public]
impl GiftedMatcher {
    pub fn can_fill(&self, price_e18: U256, limit_e18: U256, now: U256, expiry: U256) -> bool {
        price_e18 > U256::ZERO && limit_e18 > U256::ZERO
            && price_e18 <= limit_e18 && now <= expiry
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use stylus_sdk::testing::*;

    #[test]
    fn trigger_vectors() {
        let vm = TestVM::default();
        let matcher = GiftedMatcher::from(&vm);
        let n = |x| U256::from_limbs([x, 0, 0, 0]);
        assert!(matcher.can_fill(n(90), n(100), n(10), n(10)));
        assert!(!matcher.can_fill(n(101), n(100), n(10), n(20)));
        assert!(!matcher.can_fill(n(90), n(100), n(21), n(20)));
        assert!(!matcher.can_fill(n(0), n(100), n(10), n(20)));
    }
}
