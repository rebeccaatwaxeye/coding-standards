mod console;
mod file;
mod json;

pub use console::console_sink;
pub use file::{file_sink, FileSinkOptions};
pub use json::{json_sink, JsonSinkOptions};
