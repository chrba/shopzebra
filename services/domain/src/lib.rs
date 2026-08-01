//! The hexagon: domain rules, ports and use cases for the ShopZebra
//! backend. No AWS dependencies — everything here is testable against
//! the in-memory ports in `memory`.

pub mod envelope;
pub mod event;
pub mod limits;
pub mod membership;
pub mod memory;
pub mod ports;
pub mod usecases;
