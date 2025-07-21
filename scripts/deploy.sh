#!/bin/bash

# Skybound Realms Deployment Script
# Usage: ./scripts/deploy.sh [environment] [options]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENTS=("development" "staging" "production")
DEFAULT_ENV="development"

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
    echo "Usage: $0 [environment] [options]"
    echo ""
    echo "Environments:"
    echo "  development  - Deploy to development environment"
    echo "  staging      - Deploy to staging environment"
    echo "  production   - Deploy to production environment"
    echo ""
    echo "Options:"
    echo "  --build-only     - Only build the application, don't deploy"
    echo "  --migrate        - Run database migrations"
    echo "  --no-cache       - Build without Docker cache"
    echo "  --health-check   - Run health checks after deployment"
    echo "  --rollback       - Rollback to previous version"
    echo "  --help           - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 development --migrate"
    echo "  $0 production --no-cache --health-check"
    echo "  $0 staging --rollback"
}

validate_environment() {
    local env=$1
    for valid_env in "${ENVIRONMENTS[@]}"; do
        if [[ "$env" == "$valid_env" ]]; then
            return 0
        fi
    done
    return 1
}

load_environment() {
    local env=$1
    local env_file="$PROJECT_ROOT/config/environments/${env}.env"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        exit 1
    fi
    
    log_info "Loading environment configuration: $env"
    set -a
    source "$env_file"
    set +a
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

build_application() {
    local no_cache=$1
    
    log_info "Building application..."
    
    cd "$PROJECT_ROOT"
    
    local build_args=""
    if [[ "$no_cache" == "true" ]]; then
        build_args="--no-cache"
    fi
    
    # Build the Docker image
    if docker compose version &> /dev/null; then
        docker compose build $build_args
    else
        docker-compose build $build_args
    fi
    
    log_success "Application built successfully"
}

run_migrations() {
    log_info "Running database migrations..."
    
    cd "$PROJECT_ROOT"
    
    # Start only the database service
    if docker compose version &> /dev/null; then
        docker compose up -d postgres
        docker compose run --rm migration
    else
        docker-compose up -d postgres
        docker-compose run --rm migration
    fi
    
    log_success "Database migrations completed"
}

deploy_services() {
    local env=$1
    
    log_info "Deploying services for environment: $env"
    
    cd "$PROJECT_ROOT"
    
    # Deploy based on environment
    case $env in
        "development")
            if docker compose version &> /dev/null; then
                docker compose up -d
            else
                docker-compose up -d
            fi
            ;;
        "staging"|"production")
            # For staging and production, use specific compose files if they exist
            local compose_file="docker-compose.${env}.yml"
            if [[ -f "$compose_file" ]]; then
                if docker compose version &> /dev/null; then
                    docker compose -f docker-compose.yml -f "$compose_file" up -d
                else
                    docker-compose -f docker-compose.yml -f "$compose_file" up -d
                fi
            else
                if docker compose version &> /dev/null; then
                    docker compose up -d
                else
                    docker-compose up -d
                fi
            fi
            ;;
    esac
    
    log_success "Services deployed successfully"
}

run_health_checks() {
    log_info "Running health checks..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log_info "Health check attempt $attempt/$max_attempts"
        
        if curl -f -s "http://localhost:${SERVER_PORT:-3000}/health" > /dev/null; then
            log_success "Health check passed"
            return 0
        fi
        
        sleep 10
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

rollback_deployment() {
    local env=$1
    
    log_warning "Rolling back deployment for environment: $env"
    
    cd "$PROJECT_ROOT"
    
    # Stop current services
    if docker compose version &> /dev/null; then
        docker compose down
    else
        docker-compose down
    fi
    
    # Here you would typically restore from backup or previous version
    # For now, we'll just restart with the previous image
    log_info "Restarting services with previous configuration..."
    
    if docker compose version &> /dev/null; then
        docker compose up -d
    else
        docker-compose up -d
    fi
    
    log_success "Rollback completed"
}

cleanup() {
    log_info "Cleaning up..."
    
    # Remove unused Docker images and containers
    docker system prune -f
    
    log_success "Cleanup completed"
}

# Main script
main() {
    local environment="$DEFAULT_ENV"
    local build_only=false
    local migrate=false
    local no_cache=false
    local health_check=false
    local rollback=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            development|staging|production)
                environment="$1"
                shift
                ;;
            --build-only)
                build_only=true
                shift
                ;;
            --migrate)
                migrate=true
                shift
                ;;
            --no-cache)
                no_cache=true
                shift
                ;;
            --health-check)
                health_check=true
                shift
                ;;
            --rollback)
                rollback=true
                shift
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
    
    # Validate environment
    if ! validate_environment "$environment"; then
        log_error "Invalid environment: $environment"
        log_error "Valid environments: ${ENVIRONMENTS[*]}"
        exit 1
    fi
    
    # Load environment configuration
    load_environment "$environment"
    
    # Check prerequisites
    check_prerequisites
    
    # Handle rollback
    if [[ "$rollback" == "true" ]]; then
        rollback_deployment "$environment"
        exit 0
    fi
    
    # Build application
    build_application "$no_cache"
    
    # Exit if build-only
    if [[ "$build_only" == "true" ]]; then
        log_success "Build completed successfully"
        exit 0
    fi
    
    # Run migrations if requested
    if [[ "$migrate" == "true" ]]; then
        run_migrations
    fi
    
    # Deploy services
    deploy_services "$environment"
    
    # Run health checks if requested
    if [[ "$health_check" == "true" ]]; then
        if ! run_health_checks; then
            log_error "Deployment failed health checks"
            exit 1
        fi
    fi
    
    # Cleanup
    cleanup
    
    log_success "Deployment completed successfully for environment: $environment"
    log_info "Application is running at: http://localhost:${SERVER_PORT:-3000}"
}

# Run main function with all arguments
main "$@"