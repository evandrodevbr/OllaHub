use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::path::PathBuf;
use crate::scraper_logger::ScraperLogger;

#[derive(Clone)]
pub struct ScraperState {
    pub is_cancelled: Arc<AtomicBool>,
    pub logger: Arc<ScraperLogger>,
}

impl ScraperState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        ScraperState {
            is_cancelled: Arc::new(AtomicBool::new(false)),
            logger: Arc::new(ScraperLogger::new(app_data_dir)),
        }
    }

    pub fn cancel(&self) {
        self.is_cancelled.store(true, Ordering::SeqCst);
        self.logger.info("ScraperCancelled", Some("System"), None);
    }

    pub fn reset(&self) {
        self.is_cancelled.store(false, Ordering::SeqCst);
        self.logger.info("ScraperReset", Some("System"), None);
    }

    pub fn check_cancelled(&self) -> bool {
        self.is_cancelled.load(Ordering::SeqCst)
    }
}
