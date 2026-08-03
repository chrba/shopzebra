use async_trait::async_trait;
use aws_sdk_cognitoidentityprovider::Client;

use domain::event::UserId;
use domain::ports::{StoreError, UserDirectory};

/// Resolves display names from the Cognito user pool.
///
/// The lookup goes through `list_users` with a `sub` filter rather than
/// `admin_get_user`, because the pool's username is the sign-up e-mail,
/// not the `sub` we get from the verified JWT.
pub struct CognitoUserDirectory {
    client: Client,
    user_pool_id: String,
}

impl CognitoUserDirectory {
    pub fn new(client: Client, user_pool_id: String) -> Self {
        Self {
            client,
            user_pool_id,
        }
    }
}

#[async_trait]
impl UserDirectory for CognitoUserDirectory {
    async fn display_name(&self, user_id: &UserId) -> Result<Option<String>, StoreError> {
        let response = self
            .client
            .list_users()
            .user_pool_id(&self.user_pool_id)
            .filter(format!("sub = \"{}\"", user_id.0))
            .limit(1)
            .send()
            .await
            .map_err(|error| StoreError(error.to_string()))?;

        let name = response
            .users()
            .first()
            .map(|found| found.attributes())
            .unwrap_or_default()
            .iter()
            .find(|attribute| attribute.name() == "name")
            .and_then(|attribute| attribute.value())
            .map(str::to_string)
            .filter(|name| !name.is_empty());

        Ok(name)
    }
}
