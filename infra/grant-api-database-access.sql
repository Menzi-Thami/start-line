-- Run once after the first deployment, signed in as the database's Entra admin (you).
-- Creates a database user for the API's managed identity and gives it only what the app needs:
-- read and write data. Schema changes (migrations) are applied by you or the deploy pipeline, never the app.
--
-- Replace API_NAME with the apiName output of the deployment, e.g. app-taperday-api-abc123.

CREATE USER [API_NAME] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [API_NAME];
ALTER ROLE db_datawriter ADD MEMBER [API_NAME];
