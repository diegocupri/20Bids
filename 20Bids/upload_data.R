library(httr)
library(jsonlite)

# --- CONFIGURATION ---
API_URL <- "https://two0bids-api.onrender.com/api/recommendations/upload"
API_KEY <- "dev-api-key-change-in-production" # Must match server/src/index.ts
DATA_FOLDER <- "./csv_data" # Folder containing your CSV files

# --- FUNCTION TO UPLOAD ---
upload_files <- function(folder_path) {
  files <- list.files(folder_path, pattern = "\\.csv$", full.names = TRUE)
  
  if (length(files) == 0) {
    stop("No CSV files found in the specified folder.")
  }
  
  cat("Found", length(files), "files. Preparing upload...\n")
  
  # Prepare formatting for multiple files
  # Note: httr handles multipart/form-data when body is a named list with upload_file()
  # We need to create a list where every element is named "files"
  
  body_list <- list()
  for (f in files) {
    # 'files' matches the multer field name in backend: upload.array('files')
    body_list <- c(body_list, list(files = upload_file(f)))
  }
  
  cat("Sending request to", API_URL, "...\n")
  
  response <- POST(
    url = API_URL,
    add_headers(`x-api-key` = API_KEY),
    body = body_list,
    encode = "multipart"
  )
  
  # Check status
  if (status_code(response) == 200) {
    cat("✅ Success!\n")
    print(content(response, "parsed"))
  } else {
    cat("❌ Error:", status_code(response), "\n")
    print(content(response, "text"))
  }
}

# --- EXECUTION ---
# Create dummy folder if not exists (for testing)
if (!dir.exists(DATA_FOLDER)) {
  dir.create(DATA_FOLDER)
  cat("Created folder", DATA_FOLDER, "- Please put your CSV files there.\n")
} else {
  upload_files(DATA_FOLDER)
}
