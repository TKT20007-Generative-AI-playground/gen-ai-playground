FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir "fastapi[standard]" requests pymongo

COPY . .

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"] 
