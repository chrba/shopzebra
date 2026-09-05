use async_trait::async_trait;
use aws_sdk_cognitoidentityprovider::Client;

use domain::event::UserId;
use domain::ports::{StoreError, UserDirectory};

/// Resolves display names from the Cognito user pool. The user id IS the
/// pool username, so one `admin_get_user` answers; a user that is gone
/// (deleted account) resolves to None like a user without a name.
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
        let response = match self
            .client
            .admin_get_user()
            .user_pool_id(&self.user_pool_id)
            .username(&user_id.0)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error)
                if error
                    .as_service_error()
                    .is_some_and(|e| e.is_user_not_found_exception()) =>
            {
                return Ok(None)
            }
            Err(error) => return Err(StoreError(error.to_string())),
        };

        let name = response
            .user_attributes()
            .iter()
            .find(|attribute| attribute.name() == "name")
            .and_then(|attribute| attribute.value())
            .map(str::to_string)
            .filter(|name| !name.is_empty());

        Ok(name)
    }
}
