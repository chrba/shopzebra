// --- Domain types ---

pub struct Greeting {
    pub message: String,
}

#[derive(Debug)]
pub enum HelloError {
    NameEmpty,
}

impl Greeting {
    pub fn new(name: &str) -> Result<Self, HelloError> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(HelloError::NameEmpty);
        }
        Ok(Self {
            message: format!("hello, {trimmed}!"),
        })
    }
}
