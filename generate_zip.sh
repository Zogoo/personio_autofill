#! /bin/bash
zip -r store/personio-store.zip ./manifest.json ./background ./src ./popup ./icons -x "*.DS_Store"
