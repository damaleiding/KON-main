# File: midjourney_node/midjourney_generate_node.py
import torch
import base64
from io import BytesIO
from PIL import Image
from .api_client import MidjourneyAPIClient


class MidjourneyGenerateNode:
    def __init__(self):
        self.api_client = MidjourneyAPIClient()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"multiline": True, "default": "cat,cute,"}),
                "base_model": (["midjourney", "niji"], {"default": "midjourney"}),
                "version": (["5.0", "5.1", "5.2", "6", "6.1", "7", "8"], {"default": "7"}),
            },
            "optional": {
                "image_ratio": ([
                    "1:2", "6:11", "9:16", "2:3", "3:4", "4:5", "5:6", "1:1", 
                    "6:5", "5:4", "4:3", "3:2", "16:9", "2:1", "21:9"
                ], {"default": "1:1"}),
                "tile": ("BOOLEAN", {"default": False}),
                "q2": ("BOOLEAN", {"default": False}),
                "sref": ("STRING", {"default": ""}),
                "repeat": ("INT", {"default": 1, "min": 1, "max": 40, "step": 1}),
                "seed": ("INT", {"default": -1}),
                "reference_image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "task_id")
    FUNCTION = "generate"
    CATEGORY = "image"

    def generate(self, prompt, base_model, version, image_ratio="1:1",
                 tile=False, q2=False, sref="",
                 repeat=1, seed=-1, reference_image=None):
        # Construct the complete prompt
        params = prompt
        params += f" --ar {image_ratio}"
        if tile:
            params += " --tile"
            
        if q2:
            params += " --q 2"
            
        if sref:
            params += f" --sref {sref}"

        if base_model != "niji":
            params += f" --v {version}"
        else:
            params += " --niji"

        if repeat > 1:
            params += f" --repeat {repeat}"
        if seed != -1:
            params += f" --seed {seed}"

        # Handle reference images
        base64_array = []
        
        # Convert image tensor to base64 helper function - handles batch images
        def image_to_base64(img_tensor):
            base64_list = []
            # Handle batch dimension: [batch, height, width, channels] or [1, batch, height, width, channels]
            if img_tensor.dim() == 5:
                img_tensor = img_tensor.squeeze(0)
            
            # Process each image in the batch
            for i in range(img_tensor.shape[0]):
                img_np = img_tensor[i].cpu().numpy()
                # Convert from [0,1] float to [0,255] uint8
                img_np = (img_np * 255).astype('uint8')
                # Create PIL image
                img = Image.fromarray(img_np)
                # Convert to base64
                buffered = BytesIO()
                img.save(buffered, format="PNG")
                img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
                base64_list.append(f"data:image/png;base64,{img_str}")
            return base64_list
        
        # Process reference image (image prompts)
        if reference_image is not None:
            base64_array.extend(image_to_base64(reference_image))

        # Call the API client to start the generation process
        response = self.api_client.start_generation(params, base64_array)

        # Wait for the generation to complete and get the preview image
        image, task_id = self.api_client.wait_for_generation(
            response['result'])

        # Convert the image to a tensor that ComfyUI can use
        img_tensor = torch.from_numpy(image).float() / 255.0
        img_tensor = img_tensor.unsqueeze(0)  # Add batch dimension

        return (img_tensor, task_id)
