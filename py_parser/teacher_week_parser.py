import json
import logging
import time
from datetime import date, timedelta
from pathlib import Path

import psycopg2
import requests
from psycopg2.extras import execute_values