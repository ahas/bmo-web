//! Prints the OpenAPI document this crate generates, as `docs/openapi.json` keeps it.

fn main() {
  print!("{}", bmo_web_client::openapi_json());
}
