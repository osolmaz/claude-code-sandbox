const { loadConfig } = require('../../dist/config');
const { getDockerConfig, isPodman } = require('../../dist/docker-config');
const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');

describe('Podman Support Integration', () => {
  const testConfigPath = path.join(__dirname, 'test-podman-config.json');

  afterEach(() => {
    // Clean up test config file
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it('should load Podman socket path from configuration', async () => {
    // Create test config with Podman socket
    const testConfig = {
      dockerSocketPath: '/run/user/1000/podman/podman.sock',
      dockerImage: 'claude-code-sandbox:latest'
    };
    fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));

    // Load config
    const config = await loadConfig(testConfigPath);
    expect(config.dockerSocketPath).toBe('/run/user/1000/podman/podman.sock');

    // Get Docker config
    const dockerConfig = getDockerConfig(config.dockerSocketPath);
    expect(dockerConfig.socketPath).toBe('/run/user/1000/podman/podman.sock');
    expect(isPodman(dockerConfig)).toBe(true);
  });

  it('should create Docker client with Podman socket', async () => {
    const podmanSocketPath = '/custom/podman/podman.sock';
    const dockerConfig = getDockerConfig(podmanSocketPath);
    
    // Create Docker client
    const docker = new Docker(dockerConfig);
    
    // Verify the client has the correct socket path
    expect(docker.modem.socketPath).toBe(podmanSocketPath);
  });

  it('should fallback to auto-detection when no socket path in config', async () => {
    // Create config without dockerSocketPath
    const testConfig = {
      dockerImage: 'claude-code-sandbox:latest'
    };
    fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));

    // Load config
    const config = await loadConfig(testConfigPath);
    expect(config.dockerSocketPath).toBeUndefined();

    // Get Docker config - should auto-detect
    const dockerConfig = getDockerConfig(config.dockerSocketPath);
    
    // Should have detected something (Docker or Podman)
    if (dockerConfig.socketPath) {
      expect(typeof dockerConfig.socketPath).toBe('string');
    }
  });

  describe('Environment variable support', () => {
    let originalDockerHost;

    beforeEach(() => {
      originalDockerHost = process.env.DOCKER_HOST;
    });

    afterEach(() => {
      if (originalDockerHost) {
        process.env.DOCKER_HOST = originalDockerHost;
      } else {
        delete process.env.DOCKER_HOST;
      }
    });

    it('should respect DOCKER_HOST environment variable', () => {
      process.env.DOCKER_HOST = 'tcp://podman.local:2376';
      
      const dockerConfig = getDockerConfig();
      expect(dockerConfig).toEqual({});
      
      // dockerode will handle DOCKER_HOST internally
      const docker = new Docker(dockerConfig);
      expect(docker.modem.host).toBe('podman.local');
      expect(docker.modem.port).toBe('2376');
    });
  });
});