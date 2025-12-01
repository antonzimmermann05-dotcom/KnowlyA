import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { postMainOfficialApiPresignS3Upload } from '@/sdk/api-clients/CreaoFileUpload';

/**
 * Input for file upload mutation
 */
export interface UploadFileInput {
  file: File;
}

/**
 * Response from file upload mutation
 */
export interface UploadFileResponse {
  /**
   * The permanent URL where the file is accessible after upload
   */
  fileUrl: string;
  /**
   * The S3 key (path) of the uploaded file
   */
  fileKey: string;
  /**
   * Whether the upload was successful
   */
  success: boolean;
}

/**
 * Hook for uploading files to S3 via presigned URLs
 *
 * This hook handles the two-step upload process:
 * 1. Get a presigned URL from the API
 * 2. Upload the file directly to S3 using the presigned URL
 *
 * Supports: PDF, PPT, text, audio, and video files
 *
 * @example
 * ```tsx
 * const uploadMutation = useFileUploadMutation();
 *
 * const handleUpload = async (file: File) => {
 *   try {
 *     const result = await uploadMutation.mutateAsync({ file });
 *     console.log('File uploaded:', result.fileUrl);
 *   } catch (error) {
 *     console.error('Upload failed:', error);
 *   }
 * };
 * ```
 */
export function useFileUploadMutation(): UseMutationResult<
  UploadFileResponse,
  Error,
  UploadFileInput
> {
  return useMutation({
    mutationFn: async (input: UploadFileInput): Promise<UploadFileResponse> => {
      // Validate input
      if (!input.file || !(input.file instanceof File)) {
        throw new Error('Valid file object is required');
      }

      const { file } = input;

      // Step 1: Get presigned URL
      const presignResponse = await postMainOfficialApiPresignS3Upload({
        body: {
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
        },
        headers: {
          'X-CREAO-API-NAME': 'CreaoFileUpload',
          'X-CREAO-API-PATH': '/main/official-api/presign-s3-upload',
          'X-CREAO-API-ID': '68b68b97ac476c8df7efbeaf',
        },
      });

      // Check for API errors
      if (presignResponse.error) {
        const errorMessage =
          (presignResponse.error as { message?: string })?.message ||
          'Failed to generate presigned URL';
        throw new Error(errorMessage);
      }

      // Validate response data
      if (!presignResponse.data) {
        throw new Error('No response data received from presign API');
      }

      const { presignedUrl, realFileUrl, fileKey, success } = presignResponse.data;

      if (!presignedUrl) {
        throw new Error('No presigned URL returned from server');
      }

      if (!realFileUrl) {
        throw new Error('No file URL returned from server');
      }

      // Step 2: Upload file to S3 using presigned URL
      try {
        const uploadResponse = await fetch(presignedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
          mode: 'cors',
        });

        if (!uploadResponse.ok) {
          throw new Error(
            `S3 upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`
          );
        }
      } catch (uploadError) {
        // Better error handling for network failures
        if (uploadError instanceof TypeError && uploadError.message.includes('fetch')) {
          throw new Error(
            'Network error: Unable to upload file. Please check your internet connection and try again.'
          );
        }
        throw uploadError;
      }

      return {
        fileUrl: realFileUrl,
        fileKey: fileKey || '',
        success: success ?? true,
      };
    },
  });
}
