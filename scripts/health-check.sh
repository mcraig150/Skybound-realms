#!/bin/bash

# Skybound Realms Health Check Script
# Usage: ./scripts/health-check.sh [options]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULT_HOST="localhost"
DEFAULT_PORT="3000"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --host HOST      - Server host (default: localhost)"
    echo "  --port PORT      - Server port (default: 3000)"
    echo "  --timeout SEC    - Request timeout in seconds (default: 10)"
    echo "  --verbose        - Verbose output"
    echo "  --continuous     - Run continuous health checks"
    echo "  --interval SEC   - Interval for continuous checks (default: 30)"
    echo "  --help           - Show this help message"
}

check_service_health() {
    local host=$1
    local port=$2
    local timeout=$3
    local verbose=$4
    
    local url="http://${host}:${port}/api/health"
    
    if [[ "$verbose" == "true" ]]; then
        log_info "Checking health endpoint: $url"
    fi
    
    local response
    local http_code
    
    response=$(curl -s -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
    http_code="${response: -3}"
    response="${response%???}"
    
    if [[ "$http_code" == "200" ]]; then
        if [[ "$verbose" == "true" ]]; then
            log_success "Health check passed"
            echo "Response: $response"
        fi
        return 0
    else
        if [[ "$verbose" == "true" ]]; then
            log_error "Health check failed (HTTP $http_code)"
            if [[ -n "$response" ]]; then
                echo "Response: $response"
            fi
        fi
        return 1
    fi
}

check_database_health() {
    local host=$1
    local port=$2
    local timeout=$3
    local verbose=$4
    
    local url="http://${host}:${port}/api/health/database"
    
    if [[ "$verbose" == "true" ]]; then
        log_info "Checking database health: $url"
    fi
    
    local response
    local http_code
    
    response=$(curl -s -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
    http_code="${response: -3}"
    response="${response%???}"
    
    if [[ "$http_code" == "200" ]]; then
        if [[ "$verbose" == "true" ]]; then
            log_success "Database health check passed"
        fi
        return 0
    else
        if [[ "$verbose" == "true" ]]; then
            log_error "Database health check failed (HTTP $http_code)"
        fi
        return 1
    fi
}

check_redis_health() {
    local host=$1
    local port=$2
    local timeout=$3
    local verbose=$4
    
    local url="http://${host}:${port}/api/health/redis"
    
    if [[ "$verbose" == "true" ]]; then
        log_info "Checking Redis health: $url"
    fi
    
    local response
    local http_code
    
    response=$(curl -s -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
    http_code="${response: -3}"
    response="${response%???}"
    
    if [[ "$http_code" == "200" ]]; then
        if [[ "$verbose" == "true" ]]; then
            log_success "Redis health check passed"
        fi
        return 0
    else
        if [[ "$verbose" == "true" ]]; then
            log_error "Redis health check failed (HTTP $http_code)"
        fi
        return 1
    fi
}

check_websocket_health() {
    local host=$1
    local port=$2
    local timeout=$3
    local verbose=$4
    
    local url="http://${host}:${port}/api/health/websocket"
    
    if [[ "$verbose" == "true" ]]; then
        log_info "Checking WebSocket health: $url"
    fi
    
    local response
    local http_code
    
    response=$(curl -s -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
    http_code="${response: -3}"
    response="${response%???}"
    
    if [[ "$http_code" == "200" ]]; then
        if [[ "$verbose" == "true" ]]; then
            log_success "WebSocket health check passed"
        fi
        return 0
    else
        if [[ "$verbose" == "true" ]]; then
            log_error "WebSocket health check failed (HTTP $http_code)"
        fi
        return 1
    fi
}

run_comprehensive_health_check() {
    local host=$1
    local port=$2
    local timeout=$3
    local verbose=$4
    
    local overall_status=0
    
    log_info "Running comprehensive health check for ${host}:${port}"
    echo ""
    
    # Check main service health
    if check_service_health "$host" "$port" "$timeout" "$verbose"; then
        echo "✅ Service Health: PASS"
    else
        echo "❌ Service Health: FAIL"
        overall_status=1
    fi
    
    # Check database health
    if check_database_health "$host" "$port" "$timeout" "$verbose"; then
        echo "✅ Database Health: PASS"
    else
        echo "❌ Database Health: FAIL"
        overall_status=1
    fi
    
    # Check Redis health
    if check_redis_health "$host" "$port" "$timeout" "$verbose"; then
        echo "✅ Redis Health: PASS"
    else
        echo "❌ Redis Health: FAIL"
        overall_status=1
    fi
    
    # Check WebSocket health
    if check_websocket_health "$host" "$port" "$timeout" "$verbose"; then
        echo "✅ WebSocket Health: PASS"
    else
        echo "❌ WebSocket Health: FAIL"
        overall_status=1
    fi
    
    echo ""
    
    if [[ $overall_status -eq 0 ]]; then
        log_success "All health checks passed"
    else
        log_error "Some health checks failed"
    fi
    
    return $overall_status
}

run_continuous_health_check() {
    local host=$1
    local port=$2
    local timeout=$3
    local verbose=$4
    local interval=$5
    
    log_info "Starting continuous health monitoring (interval: ${interval}s)"
    log_info "Press Ctrl+C to stop"
    echo ""
    
    local check_count=0
    local success_count=0
    local failure_count=0
    
    while true; do
        ((check_count++))
        
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        echo "[$timestamp] Health Check #$check_count"
        
        if run_comprehensive_health_check "$host" "$port" "$timeout" false; then
            ((success_count++))
            echo "Status: ✅ HEALTHY"
        else
            ((failure_count++))
            echo "Status: ❌ UNHEALTHY"
        fi
        
        local success_rate=$((success_count * 100 / check_count))
        echo "Success Rate: ${success_rate}% (${success_count}/${check_count})"
        echo "----------------------------------------"
        
        sleep "$interval"
    done
}

# Main script
main() {
    local host="$DEFAULT_HOST"
    local port="$DEFAULT_PORT"
    local timeout=10
    local verbose=false
    local continuous=false
    local interval=30
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --host)
                host="$2"
                shift 2
                ;;
            --port)
                port="$2"
                shift 2
                ;;
            --timeout)
                timeout="$2"
                shift 2
                ;;
            --verbose)
                verbose=true
                shift
                ;;
            --continuous)
                continuous=true
                shift
                ;;
            --interval)
                interval="$2"
                shift 2
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    # Run health checks
    if [[ "$continuous" == "true" ]]; then
        run_continuous_health_check "$host" "$port" "$timeout" "$verbose" "$interval"
    else
        run_comprehensive_health_check "$host" "$port" "$timeout" "$verbose"
    fi
}

# Handle Ctrl+C gracefully
trap 'echo ""; log_info "Health check monitoring stopped"; exit 0' INT

# Run main function with all arguments
main "$@"