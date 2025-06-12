const { getDockerConfig, isPodman } = require('../dist/docker-config');
const fs = require('fs');
const path = require('path');

describe('Docker/Podman Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getDockerConfig', () => {
    it('should return empty config when DOCKER_HOST is set', () => {
      process.env.DOCKER_HOST = 'tcp://localhost:2375';
      const config = getDockerConfig();
      expect(config).toEqual({});
    });

    it('should return custom socket path when provided', () => {
      const customPath = '/custom/socket/path';
      const config = getDockerConfig(customPath);
      expect(config).toEqual({ socketPath: customPath });
    });

    it('should detect Docker socket at default location', () => {
      // Mock fs.existsSync and fs.statSync
      jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path === '/var/run/docker.sock';
      });
      jest.spyOn(fs, 'statSync').mockImplementation(() => ({
        isSocket: () => true
      }));

      const config = getDockerConfig();
      expect(config).toEqual({ socketPath: '/var/run/docker.sock' });

      fs.existsSync.mockRestore();
      fs.statSync.mockRestore();
    });

    it('should detect Podman rootless socket', () => {
      const expectedPath = `/run/user/${process.getuid?.() || 1000}/podman/podman.sock`;
      
      jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path === expectedPath;
      });
      jest.spyOn(fs, 'statSync').mockImplementation(() => ({
        isSocket: () => true
      }));

      const config = getDockerConfig();
      expect(config).toEqual({ socketPath: expectedPath });

      fs.existsSync.mockRestore();
      fs.statSync.mockRestore();
    });

    it('should detect Podman root socket', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path === '/run/podman/podman.sock';
      });
      jest.spyOn(fs, 'statSync').mockImplementation(() => ({
        isSocket: () => true
      }));

      const config = getDockerConfig();
      expect(config).toEqual({ socketPath: '/run/podman/podman.sock' });

      fs.existsSync.mockRestore();
      fs.statSync.mockRestore();
    });

    it('should use XDG_RUNTIME_DIR for Podman socket if available', () => {
      process.env.XDG_RUNTIME_DIR = '/run/user/1000';
      const expectedPath = '/run/user/1000/podman/podman.sock';
      
      jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
        return path === expectedPath;
      });
      jest.spyOn(fs, 'statSync').mockImplementation(() => ({
        isSocket: () => true
      }));

      const config = getDockerConfig();
      expect(config).toEqual({ socketPath: expectedPath });

      fs.existsSync.mockRestore();
      fs.statSync.mockRestore();
    });

    it('should return empty config when no socket is found', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config = getDockerConfig();
      expect(config).toEqual({});

      fs.existsSync.mockRestore();
    });

    it('should handle file system errors gracefully', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const config = getDockerConfig();
      expect(config).toEqual({});

      fs.existsSync.mockRestore();
    });
  });

  describe('isPodman', () => {
    it('should return true for Podman socket paths', () => {
      expect(isPodman({ socketPath: '/run/podman/podman.sock' })).toBe(true);
      expect(isPodman({ socketPath: '/run/user/1000/podman/podman.sock' })).toBe(true);
      expect(isPodman({ socketPath: '/var/lib/podman/podman.sock' })).toBe(true);
    });

    it('should return false for Docker socket paths', () => {
      expect(isPodman({ socketPath: '/var/run/docker.sock' })).toBe(false);
      expect(isPodman({ socketPath: '/custom/docker.sock' })).toBe(false);
    });

    it('should return false when no socket path is provided', () => {
      expect(isPodman({})).toBe(false);
      expect(isPodman({ socketPath: undefined })).toBe(false);
    });
  });

  describe('Integration with configuration', () => {
    it('should properly integrate with SandboxConfig', () => {
      const sandboxConfig = {
        dockerSocketPath: '/custom/podman/socket'
      };

      const dockerConfig = getDockerConfig(sandboxConfig.dockerSocketPath);
      expect(dockerConfig).toEqual({ socketPath: '/custom/podman/socket' });
      expect(isPodman(dockerConfig)).toBe(true);
    });
  });
});