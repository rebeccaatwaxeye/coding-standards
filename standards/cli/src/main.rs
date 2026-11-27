//! nocturna-standards — install the Nocturna coding standards into a repository.
//!
//! Usage:
//!   nocturna-standards install [dir] [lang ...]   install or update (dir defaults to .)
//!   nocturna-standards status [dir]               report installed version and drift

use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str = "Usage:
  nocturna-standards install [dir] [lang ...]   install or update (dir defaults to .)
  nocturna-standards status [dir]               report installed version and drift

Languages: typescript, php, rust, python (default: all)";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = args.first() else {
        println!("{USAGE}");
        return ExitCode::SUCCESS;
    };
    let rest = &args[1..];

    match command.as_str() {
        "install" => {
            let (dir, langs) = parse_install_args(rest);
            match nocturna_standards::install(&dir, &langs) {
                Ok(lines) => {
                    for line in lines {
                        println!("{line}");
                    }
                    println!(
                        "\nInstalled Nocturna coding standards into: {}",
                        dir.display()
                    );
                    println!("Commit AGENTS.md, agents/, .cursorrules, and CODING_STANDARDS.md.");
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!("{error}");
                    ExitCode::FAILURE
                }
            }
        }
        "status" => {
            let dir = rest
                .first()
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("."));
            match nocturna_standards::status(&dir) {
                Ok(report) => {
                    for line in report.lines {
                        println!("{line}");
                    }
                    if report.ok {
                        ExitCode::SUCCESS
                    } else {
                        ExitCode::FAILURE
                    }
                }
                Err(error) => {
                    eprintln!("{error}");
                    ExitCode::FAILURE
                }
            }
        }
        "--help" | "-h" => {
            println!("{USAGE}");
            ExitCode::SUCCESS
        }
        other => {
            eprintln!("unknown command '{other}'\n\n{USAGE}");
            ExitCode::FAILURE
        }
    }
}

fn parse_install_args(args: &[String]) -> (PathBuf, Vec<String>) {
    let (dir, langs) = match args.first() {
        Some(first) if !nocturna_standards::ALL_LANGS.contains(&first.as_str()) => {
            (PathBuf::from(first), &args[1..])
        }
        _ => (PathBuf::from("."), args),
    };
    let langs = if langs.is_empty() {
        nocturna_standards::ALL_LANGS
            .iter()
            .map(|s| s.to_string())
            .collect()
    } else {
        langs.to_vec()
    };
    (dir, langs)
}
