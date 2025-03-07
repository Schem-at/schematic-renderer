// FileTypeUtility.ts

/**
 * Enum representing the different file types that can be handled by the application
 */
export enum FileType {
    SCHEMATIC = 'schematic',
    RESOURCE_PACK = 'resourcePack',
    UNKNOWN = 'unknown'
  }
  
  export class FileTypeUtility {
    private static readonly SCHEMATIC_EXTENSIONS = ['.schem', '.litematic', '.nbt'];
    private static readonly RESOURCE_PACK_EXTENSIONS = ['.zip', '.mcpack'];
  
    public static determineFileType(file: File): FileType {
      const extension = this.getFileExtension(file.name).toLowerCase();
      
      if (this.SCHEMATIC_EXTENSIONS.includes(extension)) {
        return FileType.SCHEMATIC;
      }
      
      if (this.RESOURCE_PACK_EXTENSIONS.includes(extension)) {
        return FileType.RESOURCE_PACK;
      }
      
      return FileType.UNKNOWN;
    }

    private static getFileExtension(filename: string): string {
      const lastDotIndex = filename.lastIndexOf('.');
      if (lastDotIndex === -1) return '';
      return filename.substring(lastDotIndex);
    }
  
    public static isSchematic(file: File): boolean {
      return this.determineFileType(file) === FileType.SCHEMATIC;
    }
  
    public static isResourcePack(file: File): boolean {
      return this.determineFileType(file) === FileType.RESOURCE_PACK;
    }
  
    public static async validateResourcePack(file: File): Promise<boolean> {
      // Simple validation based on extension for now
      return this.isResourcePack(file);
      
    }
  }